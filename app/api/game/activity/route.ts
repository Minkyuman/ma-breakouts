import { getSession, unauthorized } from "@/lib/auth";
import { getLeagueOverview, LeagueError } from "@/lib/game-league";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    const league = await getLeagueOverview(user);
    return Response.json({ activity: league.activity }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof LeagueError) {
      return Response.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error("Failed to load league activity", error);
    return Response.json({ error: "리그 활동을 불러오지 못했습니다." }, { status: 503 });
  }
}
