import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { analysisSettings } from "@/db/schema";

const SETTINGS_KEY = "global";
export const DEFAULT_ANALYSIS_MODEL = "qwen/qwen3.8-flash";

const MODEL_SUGGESTIONS = [
  "qwen/qwen3.8-flash",
  "qwen/qwen3.8-max",
  "qwen/qwen3.8-27b",
  "qwen/qwen3.7-plus",
] as const;

let cachedModel: { value: string; expiresAt: number } | null = null;

export class AnalysisModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisModelError";
  }
}

export function configuredDefaultAnalysisModel() {
  const configured = process.env.OPENROUTER_ANALYSIS_MODEL?.trim().toLowerCase();
  return configured || DEFAULT_ANALYSIS_MODEL;
}

export function normalizeAnalysisModel(value: unknown) {
  const model = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9._-]{0,79}\/[a-z0-9][a-z0-9._:-]{0,79}$/u.test(model)) {
    throw new AnalysisModelError("OpenRouter 모델 ID는 provider/model 형식으로 입력해 주세요.");
  }
  return model;
}

export function analysisModelSuggestions() {
  const configured = process.env.OPENROUTER_ANALYSIS_MODEL_SUGGESTIONS
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[a-z0-9][a-z0-9._-]{0,79}\/[a-z0-9][a-z0-9._:-]{0,79}$/u.test(value));
  return [...new Set([configuredDefaultAnalysisModel(), ...(configured?.length ? configured : MODEL_SUGGESTIONS)])];
}

/** Storage is provisioned by migrations; avoid DDL in a user-facing request. */
export async function ensureAnalysisSettingsStorage() {
}

export async function getConfiguredAnalysisModel() {
  if (cachedModel && cachedModel.expiresAt > Date.now()) return cachedModel.value;
  let value = configuredDefaultAnalysisModel();
  try {
    await ensureAnalysisSettingsStorage();
    const [settings] = await getDb()
      .select({ selectedModel: analysisSettings.selectedModel })
      .from(analysisSettings)
      .where(eq(analysisSettings.key, SETTINGS_KEY))
      .limit(1);
    value = settings?.selectedModel || value;
  } catch (error) {
    const details = error instanceof Error ? error.message : "unknown";
    console.error(JSON.stringify({ service: "line-breaker-analysis", event: "model_settings.lookup_failed", details }));
  }
  cachedModel = { value, expiresAt: Date.now() + 60_000 };
  return value;
}

export function invalidateConfiguredAnalysisModel() {
  cachedModel = null;
}
