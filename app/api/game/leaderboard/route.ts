import { getSession, unauthorized } from "@/lib/auth";
import { getLeagueOverview, LeagueError, refreshLeagueValuation } from "@/lib/game-league";
import { enforceGameRateLimit, gameJson, GameRateLimitError, observeGameOperation, operationRequestId, rateLimitResponse } from "@/lib/game-operations";

export const runtime = "nodejs";

function leagueFailure(error: unknown, requestId: string) {
  if (error instanceof LeagueError) {
    const status = error.code === "QUOTE_UNAVAILABLE" || error.code === "VALUATION_CONFLICT" ? 503 : 409;
    observeGameOperation("error", "valuation.rejected", requestId, { code: error.code });
    return gameJson(requestId, { error: error.message, code: error.code }, { status });
  }
  console.error("Failed to load the league leaderboard", error);
  observeGameOperation("error", "valuation.failed", requestId);
  return gameJson(requestId, { error: "리그 순위를 불러오지 못했습니다." }, { status: 503 });
}

export async function GET(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    const league = await getLeagueOverview(user);
    return gameJson(requestId, { league });
  } catch (error) {
    return leagueFailure(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    await enforceGameRateLimit(user, "league_valuation", { limit: 2, windowSeconds: 300 });
    const league = await refreshLeagueValuation(user);
    observeGameOperation("info", "valuation.completed", requestId, { participants: league.participants.length });
    return gameJson(requestId, { league });
  } catch (error) {
    if (error instanceof GameRateLimitError) return rateLimitResponse(requestId, error);
    return leagueFailure(error, requestId);
  }
}
