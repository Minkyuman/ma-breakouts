import { getSession, unauthorized } from "@/lib/auth";
import {
  enforceGameRateLimit,
  gameJson,
  GameRateLimitError,
  observeGameOperation,
  operationRequestId,
  rateLimitResponse,
} from "@/lib/game-operations";
import { executeTrade, GameTradeError, getPortfolioDashboard } from "@/lib/game-trading";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();

  try {
    const dashboard = await getPortfolioDashboard(user);
    return gameJson(
      requestId,
      { orders: dashboard.orders },
    );
  } catch (error) {
    if (error instanceof GameTradeError) {
      return gameJson(requestId, { error: error.message, code: error.code }, { status: 409 });
    }
    console.error("Failed to load simulated orders", error);
    return gameJson(requestId, { error: "체결내역을 불러오지 못했습니다." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();

  try {
    await enforceGameRateLimit(user, "game_order", { limit: 12, windowSeconds: 60 });
  } catch (error) {
    if (error instanceof GameRateLimitError) return rateLimitResponse(requestId, error);
    observeGameOperation("error", "order.rate_limit_failed", requestId);
    return gameJson(requestId, { error: "주문 요청을 확인하지 못했습니다." }, { status: 503 });
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
    const receipt = await executeTrade(user, input as Record<string, unknown>);
    observeGameOperation("info", "order.filled", requestId, {
      symbol: receipt.symbol,
      market: receipt.market,
      side: receipt.side,
      quantity: receipt.quantity,
      replayed: receipt.replayed,
    });
    return gameJson(
      requestId,
      { receipt },
      { status: receipt.replayed ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof GameTradeError) {
      const status =
        error.code === "INSUFFICIENT_CASH" || error.code === "INSUFFICIENT_SHARES"
          ? 422
          : error.code === "IDEMPOTENCY_CONFLICT" || error.code === "NO_ACTIVE_SEASON"
            ? 409
            : error.code === "CONFLICT_RETRY_EXHAUSTED" || error.code === "QUOTE_UNAVAILABLE"
              ? 503
              : 400;
      observeGameOperation("error", "order.rejected", requestId, { code: error.code });
      return gameJson(requestId, { error: error.message, code: error.code }, { status });
    }
    observeGameOperation("error", "order.failed", requestId);
    return gameJson(requestId, { error: "모의 주문을 체결하지 못했습니다." }, { status: 503 });
  }
}
