import { getSession, unauthorized } from "@/lib/auth";
import { getGameOverview } from "@/lib/game";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSession(request);
  if (!user) return unauthorized();

  try {
    const game = await getGameOverview(user);
    return Response.json(
      { game },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to load the game profile", error);
    return Response.json(
      { error: "모의투자 정보를 불러오지 못했습니다." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
