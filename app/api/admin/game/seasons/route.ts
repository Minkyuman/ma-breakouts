import { getSession, unauthorized } from "@/lib/auth";
import { createSeasonAsAdmin, GameAdminError, getAdminGameOverview } from "@/lib/game-admin";
import { enforceGameRateLimit, gameJson, GameRateLimitError, observeGameOperation, operationRequestId, rateLimitResponse } from "@/lib/game-operations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    const admin = await getAdminGameOverview(user);
    return gameJson(requestId, { admin });
  } catch (error) {
    if (error instanceof GameAdminError) {
      return gameJson(requestId, { error: error.message, code: error.code }, { status: 403 });
    }
    observeGameOperation("error", "admin.overview_failed", requestId);
    return gameJson(requestId, { error: "리그 운영 정보를 불러오지 못했습니다." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();

  try {
    await enforceGameRateLimit(user, "admin_season_create", { limit: 5, windowSeconds: 600 });
  } catch (error) {
    if (error instanceof GameRateLimitError) return rateLimitResponse(requestId, error);
    observeGameOperation("error", "admin.rate_limit_failed", requestId);
    return gameJson(requestId, { error: "관리자 요청을 확인하지 못했습니다." }, { status: 503 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return gameJson(requestId, { error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!input || typeof input !== "object") {
    return gameJson(requestId, { error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const season = await createSeasonAsAdmin(user, input as Record<string, unknown>, requestId);
    observeGameOperation("info", "admin.season_created", requestId, { seasonId: season.id, status: season.status });
    return gameJson(requestId, { season }, { status: 201 });
  } catch (error) {
    if (error instanceof GameAdminError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "SEASON_SLUG_TAKEN" ? 409 : 400;
      observeGameOperation("error", "admin.season_rejected", requestId, { code: error.code });
      return gameJson(requestId, { error: error.message, code: error.code }, { status });
    }
    observeGameOperation("error", "admin.season_failed", requestId);
    return gameJson(requestId, { error: "시즌을 만들지 못했습니다." }, { status: 503 });
  }
}
