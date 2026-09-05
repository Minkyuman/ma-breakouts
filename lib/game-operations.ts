import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import { rateLimitBuckets } from "@/db/schema";
import type { AuthUser } from "@/lib/auth";

export type RateLimitAction = "game_order" | "league_valuation" | "league_research_note_write" | "admin_season_create" | "admin_analysis_model_update" | "admin_announcement_write";

export class GameRateLimitError extends Error {
  constructor(
    public readonly action: RateLimitAction,
    public readonly retryAfterSeconds: number,
  ) {
    super("요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.");
    this.name = "GameRateLimitError";
  }
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function actorKey(user: AuthUser) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`line-breaker:${user.sub}`));
  return hex(new Uint8Array(digest));
}

export function operationRequestId(request: Request) {
  const provided = request.headers.get("x-request-id")?.trim();
  return provided && /^[A-Za-z0-9._:-]{8,64}$/u.test(provided) ? provided : crypto.randomUUID();
}

export async function enforceGameRateLimit(
  user: AuthUser,
  action: RateLimitAction,
  options: { limit: number; windowSeconds: number; now?: Date },
) {
  const now = options.now ?? new Date();
  const windowMs = options.windowSeconds * 1000;
  const windowStartedAt = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const expiresAt = new Date(windowStartedAt.getTime() + windowMs);
  const key = await actorKey(user);
  const [bucket] = await getDb()
    .insert(rateLimitBuckets)
    .values({
      actorKey: key,
      action,
      windowStartedAt,
      expiresAt,
      requestCount: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.actorKey, rateLimitBuckets.action, rateLimitBuckets.windowStartedAt],
      set: {
        requestCount: sql`${rateLimitBuckets.requestCount} + 1`,
        updatedAt: now,
      },
    })
    .returning({ requestCount: rateLimitBuckets.requestCount });
  if (bucket.requestCount > options.limit) {
    throw new GameRateLimitError(
      action,
      Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)),
    );
  }
  return { remaining: Math.max(0, options.limit - bucket.requestCount), resetsAt: expiresAt };
}

export function gameJson(
  requestId: string,
  body: unknown,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-request-id", requestId);
  return Response.json(body, { ...init, headers });
}

export function rateLimitResponse(requestId: string, error: GameRateLimitError) {
  return gameJson(
    requestId,
    { error: error.message, code: "RATE_LIMITED", retryAfterSeconds: error.retryAfterSeconds },
    { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } },
  );
}

export function observeGameOperation(
  level: "info" | "error",
  event: string,
  requestId: string,
  fields: Record<string, string | number | boolean | null> = {},
) {
  const payload = JSON.stringify({ service: "line-breaker-game", event, requestId, ...fields });
  if (level === "error") console.error(payload);
  else console.info(payload);
}
