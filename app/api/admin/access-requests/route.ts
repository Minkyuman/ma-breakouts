import { AccessRequestError, decideAccessRequest, getAccessRequestOverview } from "@/lib/access";
import { getSession, unauthorized } from "@/lib/auth";
import { GameAdminError } from "@/lib/game-admin";
import { gameJson, operationRequestId } from "@/lib/game-operations";

export const runtime = "nodejs";

function logAccessRequestFailure(event: string, error: unknown) {
  const candidate = error && typeof error === "object" ? error as { message?: unknown; code?: unknown; cause?: { message?: unknown; code?: unknown } } : undefined;
  const details = typeof candidate?.message === "string" ? candidate.message.slice(0, 500) : "unknown";
  const cause = typeof candidate?.cause?.message === "string" ? candidate.cause.message.slice(0, 500) : undefined;
  console.error(JSON.stringify({ service: "line-breaker-access", event, details, code: candidate?.code, cause, causeCode: candidate?.cause?.code }));
}

export async function GET(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    return gameJson(requestId, { requests: await getAccessRequestOverview(user) });
  } catch (error) {
    if (error instanceof GameAdminError) return gameJson(requestId, { error: error.message }, { status: 403 });
    logAccessRequestFailure("overview_failed", error);
    return gameJson(requestId, { error: "접근 요청을 불러오지 못했습니다." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();
  let input: { id?: unknown; status?: unknown };
  try { input = await request.json(); } catch { return gameJson(requestId, { error: "요청 형식이 올바르지 않습니다." }, { status: 400 }); }
  try {
    return gameJson(requestId, { request: await decideAccessRequest(user, input.id, input.status, requestId) });
  } catch (error) {
    if (error instanceof GameAdminError) return gameJson(requestId, { error: error.message }, { status: 403 });
    if (error instanceof AccessRequestError) return gameJson(requestId, { error: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 400 });
    logAccessRequestFailure("decision_failed", error);
    return gameJson(requestId, { error: "접근 요청을 처리하지 못했습니다." }, { status: 503 });
  }
}
