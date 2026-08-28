import { getSession, unauthorized } from "@/lib/auth";
import { enrollInActiveSeason, GameError } from "@/lib/game";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const user = await getSession(request);
  if (!user) return unauthorized();

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!input || typeof input !== "object") {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const payload = input as Record<string, unknown>;
    const game = await enrollInActiveSeason(user, {
      nickname: payload.nickname,
      acceptedRules: payload.acceptedRules,
      activityFeedVisible: payload.activityFeedVisible,
    });
    return Response.json(
      { game },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof GameError) {
      const status =
        error.code === "NICKNAME_TAKEN" || error.code === "NO_ACTIVE_SEASON"
          ? 409
          : error.code === "CONFLICT_RETRY_EXHAUSTED"
            ? 503
            : 400;
      return Response.json({ error: error.message, code: error.code }, { status });
    }

    console.error("Failed to enroll the game profile", error);
    return Response.json(
      { error: "모의투자 참가 정보를 저장하지 못했습니다." },
      { status: 503 },
    );
  }
}
