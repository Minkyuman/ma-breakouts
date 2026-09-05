import { getSession, unauthorized } from "@/lib/auth";
import { createServiceAnnouncement, getAdminServiceAnnouncements, ServiceAnnouncementError, setServiceAnnouncementPublication } from "@/lib/service-announcements";
import { enforceGameRateLimit, gameJson, GameRateLimitError, operationRequestId, rateLimitResponse } from "@/lib/game-operations";
import { GameAdminError } from "@/lib/game-admin";

export const runtime = "nodejs";

function errorResponse(requestId: string, error: unknown) {
  if (error instanceof GameAdminError) return gameJson(requestId, { error: error.message, code: error.code }, { status: 403 });
  if (error instanceof ServiceAnnouncementError) return gameJson(requestId, { error: error.message, code: error.code }, { status: error.code === "NOT_FOUND" ? 404 : 400 });
  return gameJson(requestId, { error: "공지사항을 처리하지 못했습니다." }, { status: 503 });
}

export async function GET(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    return gameJson(requestId, { announcements: await getAdminServiceAnnouncements(user) });
  } catch (error) {
    return errorResponse(requestId, error);
  }
}

export async function POST(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    await enforceGameRateLimit(user, "admin_announcement_write", { limit: 12, windowSeconds: 600 });
    const input = await request.json();
    if (!input || typeof input !== "object") throw new ServiceAnnouncementError("INVALID_INPUT", "요청 형식이 올바르지 않습니다.");
    return gameJson(requestId, { announcement: await createServiceAnnouncement(user, input as Record<string, unknown>, requestId) }, { status: 201 });
  } catch (error) {
    if (error instanceof GameRateLimitError) return rateLimitResponse(requestId, error);
    return errorResponse(requestId, error);
  }
}

export async function PATCH(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    await enforceGameRateLimit(user, "admin_announcement_write", { limit: 12, windowSeconds: 600 });
    const input = await request.json() as { id?: unknown; publish?: unknown };
    return gameJson(requestId, { announcement: await setServiceAnnouncementPublication(user, input.id, input.publish, requestId) });
  } catch (error) {
    if (error instanceof GameRateLimitError) return rateLimitResponse(requestId, error);
    return errorResponse(requestId, error);
  }
}
