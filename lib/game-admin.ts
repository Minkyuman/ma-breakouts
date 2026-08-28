import { desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { auditEvents, portfolios, seasons, users } from "@/db/schema";
import type { AuthUser } from "@/lib/auth";

export class GameAdminError extends Error {
  constructor(
    public readonly code: "FORBIDDEN" | "INVALID_SEASON" | "SEASON_SLUG_TAKEN",
    message: string,
  ) {
    super(message);
    this.name = "GameAdminError";
  }
}

async function adminAccount(authUser: AuthUser) {
  const [account] = await getDb()
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.googleSub, authUser.sub))
    .limit(1);
  if (!account || account.role !== "admin") {
    throw new GameAdminError("FORBIDDEN", "리그 관리자만 접근할 수 있습니다.");
  }
  return account;
}

function databaseErrorCode(error: unknown): string | undefined {
  let current = error;
  const visited = new Set<unknown>();
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") return candidate.code;
    current = candidate.cause;
  }
  return undefined;
}

function seasonDate(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new GameAdminError("INVALID_SEASON", `${label}을 입력해 주세요.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new GameAdminError("INVALID_SEASON", `${label} 형식이 올바르지 않습니다.`);
  }
  return date;
}

function money(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{1,17}(?:\.\d{1,2})?$/u.test(normalized) || Number(normalized) <= 0) {
    throw new GameAdminError("INVALID_SEASON", "시작 자금은 0보다 큰 금액이어야 합니다.");
  }
  const [integer, decimal = ""] = normalized.split(".");
  return `${integer}.${decimal.padEnd(2, "0")}`;
}

export async function createSeasonAsAdmin(
  authUser: AuthUser,
  input: Record<string, unknown>,
  requestId: string,
) {
  const database = getDb();
  const account = await adminAccount(authUser);

  const name = typeof input.name === "string" ? input.name.normalize("NFKC").trim() : "";
  const slug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : "";
  const startsAt = seasonDate(input.startsAt, "시작 시각");
  const endsAt = seasonDate(input.endsAt, "종료 시각");
  const status = input.status === "open" ? "open" : input.status === "draft" || input.status === undefined ? "draft" : null;
  const ruleVersion = input.ruleVersion === undefined ? 1 : Number(input.ruleVersion);

  if (name.length < 2 || name.length > 100) {
    throw new GameAdminError("INVALID_SEASON", "시즌 이름은 2자 이상 100자 이하로 입력해 주세요.");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug.length > 64) {
    throw new GameAdminError("INVALID_SEASON", "시즌 slug는 영문 소문자·숫자·하이픈으로 입력해 주세요.");
  }
  if (!status) {
    throw new GameAdminError("INVALID_SEASON", "새 시즌 상태는 draft 또는 open이어야 합니다.");
  }
  if (endsAt <= startsAt) {
    throw new GameAdminError("INVALID_SEASON", "종료 시각은 시작 시각보다 늦어야 합니다.");
  }
  if (!Number.isInteger(ruleVersion) || ruleVersion <= 0) {
    throw new GameAdminError("INVALID_SEASON", "규칙 버전은 1 이상의 정수여야 합니다.");
  }

  try {
    const initialCashKrw = money(input.initialCashKrw ?? "100000000.00");
    const season = await database.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(seasons)
        .values({
          slug,
          name,
          status,
          startsAt,
          endsAt,
          initialCashKrw,
          ruleVersion,
          createdBy: account.id,
        })
        .returning({
          id: seasons.id,
          slug: seasons.slug,
          name: seasons.name,
          status: seasons.status,
          startsAt: seasons.startsAt,
          endsAt: seasons.endsAt,
          initialCashKrw: seasons.initialCashKrw,
          ruleVersion: seasons.ruleVersion,
        });
      await transaction.insert(auditEvents).values({
        actorUserId: account.id,
        action: "season.created",
        targetType: "season",
        targetId: created.id,
        requestId,
        metadata: {
          slug,
          name,
          status,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          initialCashKrw,
          ruleVersion,
        },
      });
      return created;
    });

    return {
      ...season,
      startsAt: season.startsAt.toISOString(),
      endsAt: season.endsAt.toISOString(),
    };
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      throw new GameAdminError("SEASON_SLUG_TAKEN", "이미 사용 중인 시즌 slug입니다.");
    }
    throw error;
  }
}

export async function getAdminGameOverview(authUser: AuthUser) {
  await adminAccount(authUser);
  const database = getDb();
  const seasonRows = await database.select().from(seasons).orderBy(desc(seasons.startsAt)).limit(12);
  const seasonIds = seasonRows.map((season) => season.id);
  const [portfolioRows, eventRows] = await Promise.all([
    seasonIds.length
      ? database.select({ seasonId: portfolios.seasonId }).from(portfolios).where(inArray(portfolios.seasonId, seasonIds))
      : [],
    database
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        targetType: auditEvents.targetType,
        targetId: auditEvents.targetId,
        requestId: auditEvents.requestId,
        metadata: auditEvents.metadata,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .orderBy(desc(auditEvents.createdAt))
      .limit(30),
  ]);
  const participantCounts = new Map<string, number>();
  for (const row of portfolioRows) participantCounts.set(row.seasonId, (participantCounts.get(row.seasonId) ?? 0) + 1);
  return {
    seasons: seasonRows.map((season) => ({
      id: season.id,
      slug: season.slug,
      name: season.name,
      status: season.status,
      startsAt: season.startsAt.toISOString(),
      endsAt: season.endsAt.toISOString(),
      initialCashKrw: season.initialCashKrw,
      ruleVersion: season.ruleVersion,
      participantCount: participantCounts.get(season.id) ?? 0,
    })),
    auditEvents: eventRows.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
  };
}
