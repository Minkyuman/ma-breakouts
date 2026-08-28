import { getSession, unauthorized } from "@/lib/auth";
import { GameTradeError, getPortfolioDashboard } from "@/lib/game-trading";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSession(request);
  if (!user) return unauthorized();

  try {
    const dashboard = await getPortfolioDashboard(user);
    return Response.json(
      { dashboard },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof GameTradeError) {
      return Response.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error("Failed to load the simulated portfolio", error);
    return Response.json({ error: "내 투자 정보를 불러오지 못했습니다." }, { status: 503 });
  }
}
