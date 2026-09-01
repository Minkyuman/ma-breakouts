import { getSession, unauthorized } from "@/lib/auth";
import { AnalysisModelError, updateAnalysisModelAsAdmin } from "@/lib/admin-analysis";
import { GameAdminError, getAdminGameOverview } from "@/lib/game-admin";
import { enforceGameRateLimit, gameJson, GameRateLimitError, observeGameOperation, operationRequestId, rateLimitResponse } from "@/lib/game-operations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    const admin = await getAdminGameOverview(user);
    return gameJson(requestId, { analysisModel: admin.analysisModel });
  } catch (error) {
    if (error instanceof GameAdminError) return gameJson(requestId, { error: error.message, code: error.code }, { status: 403 });
    observeGameOperation("error", "analysis_model.overview_failed", requestId);
    return gameJson(requestId, { error: "AI 모델 설정을 불러오지 못했습니다." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const requestId = operationRequestId(request);
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    await enforceGameRateLimit(user, "admin_analysis_model_update", { limit: 8, windowSeconds: 600 });
  } catch (error) {
    if (error instanceof GameRateLimitError) return rateLimitResponse(requestId, error);
    observeGameOperation("error", "analysis_model.rate_limit_failed", requestId);
    return gameJson(requestId, { error: "관리자 요청을 확인하지 못했습니다." }, { status: 503 });
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return gameJson(requestId, { error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!input || typeof input !== "object") return gameJson(requestId, { error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  try {
    const analysisModel = await updateAnalysisModelAsAdmin(user, input as Record<string, unknown>, requestId);
    observeGameOperation("info", "analysis_model.updated", requestId, { selectedModel: analysisModel.selectedModel });
    return gameJson(requestId, { analysisModel });
  } catch (error) {
    if (error instanceof GameAdminError) return gameJson(requestId, { error: error.message, code: error.code }, { status: 403 });
    if (error instanceof AnalysisModelError) return gameJson(requestId, { error: error.message, code: "INVALID_MODEL" }, { status: 400 });
    observeGameOperation("error", "analysis_model.update_failed", requestId);
    return gameJson(requestId, { error: "AI 모델 설정을 저장하지 못했습니다." }, { status: 503 });
  }
}
