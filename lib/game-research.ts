import { and, count, desc, eq, gt, lt, lte, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { gameProfiles, leagueResearchPicks, portfolios, seasons, users } from "@/db/schema";
import type { AuthUser } from "@/lib/auth";
import { searchUniverse, type Ticker } from "@/lib/market";

const PAGE_SIZE = 20;
const MAX_NOTE_LENGTH = 10_000;
let researchSchemaRepair: Promise<void> | null = null;

export function ensureLeagueResearchStorage() {
  // A prior production migration recorded successfully while the physical column
  // was absent. Keep this idempotent repair until every running deployment has
  // crossed that version; it is memoized per server instance to avoid request races.
  // The base migration continues to enable row level security for this table.
  if (!researchSchemaRepair) {
    researchSchemaRepair = getDb().transaction(async (transaction) => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(87132045)`);
      await transaction.execute(sql`ALTER TABLE league_research_picks ADD COLUMN IF NOT EXISTS chart_image_url varchar(2048)`);
    })
      .then(() => undefined)
      .catch((error) => {
        researchSchemaRepair = null;
        throw error;
      });
  }
  return researchSchemaRepair;
}

export type LeagueResearchNote = {
  id: string;
  profileId: string;
  nickname: string;
  avatarUrl: string | null;
  symbol: string;
  securityName: string;
  market: string;
  assetType: "STOCK" | "ETF" | "INDEX";
  researchNote: string | null;
  chartImageUrl: string | null;
  analysisDate: string;
  createdAt: string;
  updatedAt: string;
  isMine: boolean;
};

export type ResearchNotesPage = {
  notes: LeagueResearchNote[];
  nextCursor: string | null;
  total: number;
};

export class LeagueResearchError extends Error {
  constructor(
    public readonly code: "NOT_ENROLLED" | "INVALID_SECURITY" | "INVALID_NOTE" | "NOTE_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "LeagueResearchError";
  }
}

async function activeMembership(authUser: AuthUser) {
  const now = new Date();
  const [row] = await getDb()
    .select({ season: seasons, user: users, profile: gameProfiles })
    .from(users)
    .innerJoin(gameProfiles, eq(gameProfiles.userId, users.id))
    .innerJoin(portfolios, eq(portfolios.userId, users.id))
    .innerJoin(seasons, eq(seasons.id, portfolios.seasonId))
    .where(and(
      eq(users.googleSub, authUser.sub),
      eq(seasons.status, "open"),
      lte(seasons.startsAt, now),
      gt(seasons.endsAt, now),
    ))
    .orderBy(desc(seasons.startsAt))
    .limit(1);
  if (!row) throw new LeagueResearchError("NOT_ENROLLED", "먼저 선 넘는 리그에 참가해 주세요.");
  return row;
}

function serializeNote(row: {
  pick: typeof leagueResearchPicks.$inferSelect;
  profile: typeof gameProfiles.$inferSelect;
  user: typeof users.$inferSelect;
}, ownerId: string): LeagueResearchNote {
  return {
    id: row.pick.id,
    profileId: row.profile.id,
    nickname: row.profile.nickname,
    avatarUrl: row.user.avatarUrl,
    symbol: row.pick.symbol,
    securityName: row.pick.securityName,
    market: row.pick.market,
    assetType: row.pick.assetType as "STOCK" | "ETF" | "INDEX",
    researchNote: row.pick.researchNote,
    chartImageUrl: row.pick.chartImageUrl,
    analysisDate: row.pick.analysisDate,
    createdAt: row.pick.createdAt.toISOString(),
    updatedAt: row.pick.updatedAt.toISOString(),
    isMine: row.pick.userId === ownerId,
  };
}

function parseCursor(value: string | undefined) {
  if (!value || !/^\d{13}:[0-9a-f-]{36}$/iu.test(value)) return null;
  const [timestamp, id] = value.split(":");
  const createdAt = new Date(Number(timestamp));
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id };
}

function pageCursor(note: LeagueResearchNote | undefined) {
  if (!note) return null;
  return `${new Date(note.createdAt).getTime()}:${note.id}`;
}

export async function getLeagueResearchNotes(
  authUser: AuthUser,
  input: { symbol?: string; market?: string; cursor?: string },
): Promise<ResearchNotesPage> {
  await ensureLeagueResearchStorage();
  const membership = await activeMembership(authUser);
  const cursor = parseCursor(input.cursor);
  const baseConditions = [eq(leagueResearchPicks.seasonId, membership.season.id)];
  if (input.symbol) baseConditions.push(eq(leagueResearchPicks.symbol, input.symbol.trim().toUpperCase()));
  if (input.market) baseConditions.push(eq(leagueResearchPicks.market, input.market.trim().toUpperCase()));
  const conditions = [...baseConditions];
  if (cursor) {
    conditions.push(or(
      lt(leagueResearchPicks.createdAt, cursor.createdAt),
      and(eq(leagueResearchPicks.createdAt, cursor.createdAt), lt(leagueResearchPicks.id, cursor.id)),
    )!);
  }
  const database = getDb();
  const [rows, [{ total }]] = await Promise.all([
    database
    .select({ pick: leagueResearchPicks, profile: gameProfiles, user: users })
    .from(leagueResearchPicks)
    .innerJoin(gameProfiles, eq(gameProfiles.userId, leagueResearchPicks.userId))
    .innerJoin(users, eq(users.id, leagueResearchPicks.userId))
    .where(and(...conditions))
    .orderBy(desc(leagueResearchPicks.createdAt), desc(leagueResearchPicks.id))
    .limit(PAGE_SIZE + 1),
    database.select({ total: count() }).from(leagueResearchPicks).where(and(...baseConditions)),
  ]);
  const notes = rows.slice(0, PAGE_SIZE).map((row) => serializeNote(row, membership.user.id));
  return { notes, nextCursor: rows.length > PAGE_SIZE ? pageCursor(notes.at(-1)) : null, total };
}

function normalizeNote(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new LeagueResearchError("INVALID_NOTE", "분석 메모 형식이 올바르지 않습니다.");
  const note = value.normalize("NFC").trim();
  if (Array.from(note).length > MAX_NOTE_LENGTH) {
    throw new LeagueResearchError("INVALID_NOTE", `분석 메모는 ${MAX_NOTE_LENGTH.toLocaleString("ko-KR")}자 이내로 입력해 주세요.`);
  }
  return note || null;
}

function normalizeAnalysisDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new LeagueResearchError("INVALID_NOTE", "분석 기준일을 YYYY-MM-DD 형식으로 입력해 주세요.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new LeagueResearchError("INVALID_NOTE", "올바른 분석 기준일을 입력해 주세요.");
  }
  return value;
}

const MARKET_RESEARCH_TICKERS: Ticker[] = [
  ["kospi", "코스피", "KOSPI"], ["kosdaq", "코스닥", "KOSDAQ"], ["sp500", "S&P 500", "NYSE"],
  ["nasdaq100", "나스닥 100", "NASDAQ"], ["nasdaq", "나스닥 종합", "NASDAQ"], ["dow", "다우존스", "NYSE"],
  ["russell", "러셀 2000", "NYSE"], ["sox", "필라델피아 반도체", "NASDAQ"], ["taiex", "대만 가권지수", "GLOBAL"], ["csi300", "중국 CSI 300", "GLOBAL"], ["hangsengtech", "항셍테크 ETF 추적", "GLOBAL"], ["nikkei", "일본 닛케이 225", "GLOBAL"], ["nasdaqfutures", "나스닥 100 선물", "GLOBAL"], ["sp500futures", "S&P 500 선물", "GLOBAL"], ["usdkrw", "달러 / 원", "KOSPI"], ["vix", "VIX 변동성 지수", "NYSE"], ["dxy", "달러 인덱스", "GLOBAL"], ["ust10y", "미국 10년물 국채금리", "GLOBAL"], ["wti", "WTI 유가", "GLOBAL"],
].map(([id, name, market]) => ({
  code: `MARKET:${id.toUpperCase()}`,
  name,
  market: market as Ticker["market"],
  assetType: "INDEX" as const,
  marketCap: 0,
  price: 0,
}));

async function resolveSecurity(symbolValue: unknown, marketValue: unknown): Promise<Ticker> {
  if (typeof symbolValue !== "string" || typeof marketValue !== "string") {
    throw new LeagueResearchError("INVALID_SECURITY", "목록에서 종목을 선택해 주세요.");
  }
  const symbol = symbolValue.trim().toUpperCase();
  const market = marketValue.trim().toUpperCase();
  const marketTicker = MARKET_RESEARCH_TICKERS.find((candidate) => candidate.code === symbol);
  if (marketTicker) return marketTicker;
  const candidates = await searchUniverse(symbol, 20);
  const ticker = candidates.find((candidate) =>
    candidate.code === symbol && candidate.market === market && (candidate.assetType === "STOCK" || candidate.assetType === "ETF"),
  );
  if (!ticker) throw new LeagueResearchError("INVALID_SECURITY", "지원되는 종목을 목록에서 다시 선택해 주세요.");
  return ticker;
}

export async function createLeagueResearchNote(authUser: AuthUser, input: {
  symbol: unknown;
  market: unknown;
  researchNote?: unknown;
  chartImageUrl?: unknown;
  analysisDate: unknown;
}) {
  await ensureLeagueResearchStorage();
  const [membership, ticker] = await Promise.all([activeMembership(authUser), resolveSecurity(input.symbol, input.market)]);
  const researchNote = normalizeNote(input.researchNote);
  const chartImageUrl = typeof input.chartImageUrl === "string" && /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//iu.test(input.chartImageUrl)
    ? input.chartImageUrl
    : null;
  const analysisDate = normalizeAnalysisDate(input.analysisDate);
  const [pick] = await getDb().insert(leagueResearchPicks).values({
    seasonId: membership.season.id,
    userId: membership.user.id,
    symbol: ticker.code,
    securityName: ticker.name,
    market: ticker.market,
    assetType: ticker.assetType,
    researchNote,
    chartImageUrl,
    analysisDate,
  }).returning();
  return serializeNote({ pick, profile: membership.profile, user: membership.user }, membership.user.id);
}

export async function deleteLeagueResearchNote(authUser: AuthUser, id: unknown) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/iu.test(id)) {
    throw new LeagueResearchError("NOTE_NOT_FOUND", "삭제할 분석 노트를 찾을 수 없습니다.");
  }
  await ensureLeagueResearchStorage();
  const membership = await activeMembership(authUser);
  const [deleted] = await getDb().delete(leagueResearchPicks).where(and(
    eq(leagueResearchPicks.id, id),
    eq(leagueResearchPicks.seasonId, membership.season.id),
    eq(leagueResearchPicks.userId, membership.user.id),
  )).returning({ id: leagueResearchPicks.id, chartImageUrl: leagueResearchPicks.chartImageUrl });
  if (!deleted) throw new LeagueResearchError("NOTE_NOT_FOUND", "삭제할 분석 노트를 찾을 수 없습니다.");
  return deleted;
}
