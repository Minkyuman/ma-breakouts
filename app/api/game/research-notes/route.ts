import { getSession, unauthorized } from "@/lib/auth";
import { del, put } from "@vercel/blob";
import {
  createLeagueResearchNote,
  deleteLeagueResearchNote,
  getLeagueResearchNotes,
  LeagueResearchError,
} from "@/lib/game-research";
import {
  enforceGameRateLimit,
  gameJson,
  GameRateLimitError,
  observeGameOperation,
  operationRequestId,
  rateLimitResponse,
} from "@/lib/game-operations";

export const runtime = "nodejs";
const MAX_CHART_IMAGE_BYTES = 3 * 1024 * 1024;

async function uploadChartImage(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.type !== "image/png") throw new LeagueResearchError("INVALID_NOTE", "차트 이미지는 PNG 형식만 첨부할 수 있습니다.");
  if (value.size > MAX_CHART_IMAGE_BYTES) throw new LeagueResearchError("INVALID_NOTE", "차트 이미지는 3MB 이하여야 합니다.");
  const uploaded = await put(`league-research/${crypto.randomUUID()}.png`, value, {
    access: "public",
    addRandomSuffix: false,
    contentType: "image/png",
  });
  return uploaded.url;
}

function failure(error: unknown, requestId: string) {
  if (error instanceof LeagueResearchError) {
    const status = error.code === "NOT_ENROLLED" ? 409 : error.code === "NOTE_NOT_FOUND" ? 404 : 400;
    return gameJson(requestId, { error: error.message, code: error.code }, { status });
  }
  let code: string | null = null;
  let current = error;
  const visited = new Set<unknown>();
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") { code = candidate.code; break; }
    current = candidate.cause;
  }
  observeGameOperation("error", "research_note.failed", requestId, { code });
  if (code === "42P01") {
    return gameJson(requestId, { error: "분석 노트 저장소를 준비하는 중입니다. 잠시 후 다시 시도해 주세요.", code: "RESEARCH_STORAGE_UNAVAILABLE" }, { status: 503 });
  }
  return gameJson(requestId, { error: "분석 노트를 처리하지 못했습니다." }, { status: 503 });
}

export async function GET(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    const params = new URL(request.url).searchParams;
    const research = await getLeagueResearchNotes(user, {
      symbol: params.get("symbol") ?? undefined,
      market: params.get("market") ?? undefined,
      cursor: params.get("cursor") ?? undefined,
    });
    return gameJson(requestId, { research });
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    await enforceGameRateLimit(user, "league_research_note_write", { limit: 20, windowSeconds: 300 });
    const multipart = request.headers.get("content-type")?.includes("multipart/form-data");
    const form = multipart ? await request.formData() : null;
    const chartImageUrl = form ? await uploadChartImage(form.get("chartImage")) : null;
    const payload = form
      ? { symbol: form.get("symbol"), market: form.get("market"), researchNote: form.get("researchNote"), analysisDate: form.get("analysisDate"), chartImageUrl }
      : await request.json() as { symbol: unknown; market: unknown; researchNote?: unknown; analysisDate: unknown; chartImageUrl?: unknown };
    let note;
    try {
      note = await createLeagueResearchNote(user, payload);
    } catch (error) {
      if (chartImageUrl) await del(chartImageUrl).catch(() => undefined);
      throw error;
    }
    observeGameOperation("info", "research_note.created", requestId, { market: note.market, assetType: note.assetType });
    return gameJson(requestId, { note }, { status: 201 });
  } catch (error) {
    if (error instanceof GameRateLimitError) return rateLimitResponse(requestId, error);
    return failure(error, requestId);
  }
}

export async function DELETE(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    await enforceGameRateLimit(user, "league_research_note_write", { limit: 20, windowSeconds: 300 });
    const payload = await request.json() as { id?: unknown };
    const deleted = await deleteLeagueResearchNote(user, payload.id);
    if (deleted.chartImageUrl) await del(deleted.chartImageUrl).catch(() => undefined);
    observeGameOperation("info", "research_note.deleted", requestId);
    return gameJson(requestId, { ok: true });
  } catch (error) {
    if (error instanceof GameRateLimitError) return rateLimitResponse(requestId, error);
    return failure(error, requestId);
  }
}
