import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth";
import { searchUniverse } from "@/lib/market";

export async function GET(request: Request) {
  if (!(await getSession(request))) return unauthorized();
  try {
    const params = new URL(request.url).searchParams;
    const query = params.get("query") ?? "";
    const tickers = await searchUniverse(query, 8);
    return NextResponse.json(
      { tickers, count: tickers.length, query },
      {
        // Search results contain only public instrument metadata. Sharing a
        // short-lived response cache keeps common queries fast across Vercel
        // instances while the database index remains the source of truth.
        headers: {
          "cache-control": "public, s-maxage=300, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "종목 검색에 실패했습니다." },
      { status: 502 },
    );
  }
}
