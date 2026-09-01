import { NextResponse } from "next/server";
import { ensureSearchIndexStorage, refreshSearchIndex } from "@/lib/market";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Vercel invokes this route once per day. It has no user session path: a
 * configured CRON_SECRET is mandatory so the full provider refresh cannot be
 * triggered by a browser request.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }
  try {
    await ensureSearchIndexStorage();
    const result = await refreshSearchIndex();
    console.info(JSON.stringify({
      service: "line-breaker-search-index",
      event: "refresh.completed",
      count: result.count,
      refreshedAt: result.refreshedAt.toISOString(),
    }));
    return NextResponse.json({ count: result.count, refreshedAt: result.refreshedAt.toISOString() });
  } catch (error) {
    const details = error instanceof Error ? error.message : "unknown";
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : null;
    console.error(JSON.stringify({ service: "line-breaker-search-index", event: "refresh.failed", details, cause }));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "검색 인덱스를 갱신하지 못했습니다." },
      { status: 502 },
    );
  }
}
