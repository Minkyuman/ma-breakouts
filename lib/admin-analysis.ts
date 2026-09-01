import { getDb } from "@/db";
import { analysisSettings, auditEvents } from "@/db/schema";
import { analysisModelSuggestions, AnalysisModelError, ensureAnalysisSettingsStorage, invalidateConfiguredAnalysisModel, normalizeAnalysisModel } from "@/lib/analysis-model-settings";
import { requireAdminAccount } from "@/lib/game-admin";
import type { AuthUser } from "@/lib/auth";

export async function updateAnalysisModelAsAdmin(
  authUser: AuthUser,
  input: Record<string, unknown>,
  requestId: string,
) {
  const account = await requireAdminAccount(authUser);
  const selectedModel = normalizeAnalysisModel(input.model);
  await ensureAnalysisSettingsStorage();
  const saved = await getDb().transaction(async (transaction) => {
    const [settings] = await transaction
      .insert(analysisSettings)
      .values({ key: "global", selectedModel, updatedBy: account.id, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: analysisSettings.key,
        set: { selectedModel, updatedBy: account.id, updatedAt: new Date() },
      })
      .returning({ selectedModel: analysisSettings.selectedModel, updatedAt: analysisSettings.updatedAt });
    await transaction.insert(auditEvents).values({
      actorUserId: account.id,
      action: "analysis.model_updated",
      targetType: "analysis_settings",
      targetId: null,
      requestId,
      metadata: { selectedModel: settings.selectedModel },
    });
    return settings;
  });
  invalidateConfiguredAnalysisModel();
  return {
    selectedModel: saved.selectedModel,
    updatedAt: saved.updatedAt.toISOString(),
    suggestions: analysisModelSuggestions(),
  };
}

export { AnalysisModelError };
