import { getSession, unauthorized } from "@/lib/auth";
import { getPublicPlayerDetail, LeagueError } from "@/lib/game-league";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ profileId: string }> | { profileId: string } },
) {
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    const params = await context.params;
    const player = await getPublicPlayerDetail(user, params.profileId);
    return Response.json({ player }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof LeagueError) {
      const status = error.code === "PLAYER_NOT_FOUND" ? 404 : 409;
      return Response.json({ error: error.message, code: error.code }, { status });
    }
    console.error("Failed to load public player portfolio", error);
    return Response.json({ error: "참가자 포트폴리오를 불러오지 못했습니다." }, { status: 503 });
  }
}
