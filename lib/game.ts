import { and, desc, eq, gt, lte } from "drizzle-orm";

import { getDb } from "@/db";
import {
  cashLedger,
  gameProfiles,
  portfolios,
  seasons,
  users,
} from "@/db/schema";
import { isGameAdminEmail, type AuthUser } from "@/lib/auth";

const SEED_IDEMPOTENCY_KEY = "season-seed:v1";
const SERIALIZABLE_RETRY_LIMIT = 3;

export type GameOverview = {
  status: "unavailable" | "onboarding" | "ready";
  isAdmin: boolean;
  season: {
    id: string;
    name: string;
    startsAt: string;
    endsAt: string;
    initialCashKrw: string;
    ruleVersion: number;
  } | null;
  profile: {
    nickname: string;
    activityFeedVisible: boolean;
  } | null;
  portfolio: {
    cashKrw: string;
    equityKrw: string;
    joinedAt: string;
  } | null;
};

export class GameError extends Error {
  constructor(
    public readonly code:
      | "INVALID_NICKNAME"
      | "RULES_NOT_ACCEPTED"
      | "NO_ACTIVE_SEASON"
      | "NICKNAME_TAKEN"
      | "CONFLICT_RETRY_EXHAUSTED",
    message: string,
  ) {
    super(message);
    this.name = "GameError";
  }
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

export function normalizeNickname(value: unknown) {
  if (typeof value !== "string") {
    throw new GameError("INVALID_NICKNAME", "닉네임을 입력해 주세요.");
  }

  const nickname = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (nickname.length < 2 || nickname.length > 16) {
    throw new GameError(
      "INVALID_NICKNAME",
      "닉네임은 2자 이상 16자 이하로 입력해 주세요.",
    );
  }
  if (!/^[가-힣A-Za-z0-9_ ]+$/u.test(nickname)) {
    throw new GameError(
      "INVALID_NICKNAME",
      "닉네임에는 한글, 영문, 숫자, 공백, 밑줄만 사용할 수 있습니다.",
    );
  }

  return nickname;
}

function publicOverview(
  season: typeof seasons.$inferSelect | undefined,
  profile: typeof gameProfiles.$inferSelect | undefined,
  portfolio: typeof portfolios.$inferSelect | undefined,
  isAdmin = false,
): GameOverview {
  if (!season) {
    return { status: "unavailable", isAdmin, season: null, profile: null, portfolio: null };
  }

  return {
    status: profile && portfolio ? "ready" : "onboarding",
    isAdmin,
    season: {
      id: season.id,
      name: season.name,
      startsAt: season.startsAt.toISOString(),
      endsAt: season.endsAt.toISOString(),
      initialCashKrw: season.initialCashKrw,
      ruleVersion: season.ruleVersion,
    },
    profile: profile
      ? {
          nickname: profile.nickname,
          activityFeedVisible: profile.activityFeedVisible,
        }
      : null,
    portfolio: portfolio
      ? {
          cashKrw: portfolio.cashKrw,
          equityKrw: portfolio.equityKrw,
          joinedAt: portfolio.joinedAt.toISOString(),
        }
      : null,
  };
}

async function activeSeason(
  database: Pick<ReturnType<typeof getDb>, "select">,
  now: Date,
) {
  const [season] = await database
    .select()
    .from(seasons)
    .where(
      and(
        eq(seasons.status, "open"),
        lte(seasons.startsAt, now),
        gt(seasons.endsAt, now),
      ),
    )
    .orderBy(desc(seasons.startsAt))
    .limit(1);
  return season;
}

export async function getGameOverview(authUser: AuthUser): Promise<GameOverview> {
  const database = getDb();
  const season = await activeSeason(database, new Date());
  if (!season) return publicOverview(undefined, undefined, undefined);

  const [account] = await database
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.googleSub, authUser.sub))
    .limit(1);
  // A configured operator may manage access before joining a trading season.
  // Do not fabricate a profile or portfolio, but surface the admin entry.
  if (!account) return publicOverview(season, undefined, undefined, isGameAdminEmail(authUser.email));

  const [[profile], [portfolio]] = await Promise.all([
    database
      .select()
      .from(gameProfiles)
      .where(eq(gameProfiles.userId, account.id))
      .limit(1),
    database
      .select()
      .from(portfolios)
      .where(
        and(
          eq(portfolios.userId, account.id),
          eq(portfolios.seasonId, season.id),
        ),
      )
      .limit(1),
  ]);

  return publicOverview(season, profile, portfolio, account.role === "admin" || isGameAdminEmail(authUser.email));
}

export async function enrollInActiveSeason(
  authUser: AuthUser,
  input: {
    nickname: unknown;
    acceptedRules: unknown;
    activityFeedVisible?: unknown;
  },
): Promise<GameOverview> {
  const nickname = normalizeNickname(input.nickname);
  if (input.acceptedRules !== true) {
    throw new GameError(
      "RULES_NOT_ACCEPTED",
      "모의투자 운영 원칙에 동의해 주세요.",
    );
  }
  const activityFeedVisible = input.activityFeedVisible !== false;
  const database = getDb();

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await database.transaction(
        async (transaction) => {
          const now = new Date();
          const season = await activeSeason(transaction, now);
          if (!season) {
            throw new GameError(
              "NO_ACTIVE_SEASON",
              "현재 참여 가능한 모의투자 시즌이 없습니다.",
            );
          }

          const [account] = await transaction
            .insert(users)
            .values({
              googleSub: authUser.sub,
              email: authUser.email.trim().toLowerCase(),
              displayName: authUser.name,
              avatarUrl: authUser.picture,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: users.googleSub,
              set: {
                email: authUser.email.trim().toLowerCase(),
                displayName: authUser.name,
                avatarUrl: authUser.picture,
                updatedAt: now,
              },
            })
            .returning();

          const [profile] = await transaction
            .insert(gameProfiles)
            .values({
              userId: account.id,
              nickname,
              activityFeedVisible,
              acceptedRulesVersion: season.ruleVersion,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: gameProfiles.userId,
              set: {
                nickname,
                activityFeedVisible,
                acceptedRulesVersion: season.ruleVersion,
                updatedAt: now,
              },
            })
            .returning();

          const [createdPortfolio] = await transaction
            .insert(portfolios)
            .values({
              seasonId: season.id,
              userId: account.id,
              cashKrw: season.initialCashKrw,
              equityKrw: season.initialCashKrw,
              updatedAt: now,
            })
            .onConflictDoNothing({
              target: [portfolios.seasonId, portfolios.userId],
            })
            .returning();

          const portfolio =
            createdPortfolio ??
            (
              await transaction
                .select()
                .from(portfolios)
                .where(
                  and(
                    eq(portfolios.seasonId, season.id),
                    eq(portfolios.userId, account.id),
                  ),
                )
                .limit(1)
            )[0];

          if (!portfolio) {
            throw new Error("포트폴리오 생성 결과를 확인할 수 없습니다.");
          }

          await transaction
            .insert(cashLedger)
            .values({
              portfolioId: portfolio.id,
              entryType: "season_seed",
              amountKrw: season.initialCashKrw,
              balanceAfterKrw: season.initialCashKrw,
              idempotencyKey: SEED_IDEMPOTENCY_KEY,
              referenceType: "season",
              referenceId: season.id,
              note: `${season.name} 시작 자금`,
            })
            .onConflictDoNothing({
              target: [cashLedger.portfolioId, cashLedger.idempotencyKey],
            });

          return publicOverview(season, profile, portfolio, account.role === "admin" || isGameAdminEmail(authUser.email));
        },
        { isolationLevel: "serializable", accessMode: "read write" },
      );
    } catch (error) {
      if (error instanceof GameError) throw error;
      const code = databaseErrorCode(error);
      if (code === "23505") {
        throw new GameError(
          "NICKNAME_TAKEN",
          "이미 사용 중인 닉네임입니다. 다른 닉네임을 선택해 주세요.",
        );
      }
      if (code === "40001" && attempt < SERIALIZABLE_RETRY_LIMIT) continue;
      if (code === "40001") {
        throw new GameError(
          "CONFLICT_RETRY_EXHAUSTED",
          "동시에 요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
      throw error;
    }
  }

  throw new GameError(
    "CONFLICT_RETRY_EXHAUSTED",
    "동시에 요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.",
  );
}
