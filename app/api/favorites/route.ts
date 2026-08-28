import { getSession, unauthorized } from "@/lib/auth";
import { FavoriteError, getFavoriteLists, mutateFavorites } from "@/lib/favorites";

export const runtime = "nodejs";

function databaseErrorCode(error: unknown) {
  let current = error;
  const visited = new Set<unknown>();
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") return candidate.code;
    current = candidate.cause;
  }
  return "";
}

export async function GET(request: Request) {
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    return Response.json({ lists: await getFavoriteLists(user) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Failed to load favorites", error);
    return Response.json({ error: "즐겨찾기를 불러오지 못했습니다." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getSession(request);
  if (!user) return unauthorized();
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!input || typeof input !== "object") return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  try {
    return Response.json({ lists: await mutateFavorites(user, input as Record<string, unknown>) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof FavoriteError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "NAME_TAKEN" ? 409 : 400;
      return Response.json({ error: error.message, code: error.code }, { status });
    }
    const databaseCode = databaseErrorCode(error);
    if (databaseCode === "23505") return Response.json({ error: "같은 이름의 즐겨찾기 목록이 이미 있습니다.", code: "NAME_TAKEN" }, { status: 409 });
    console.error("Failed to update favorites", error);
    return Response.json({ error: "즐겨찾기를 저장하지 못했습니다." }, { status: 503 });
  }
}
