import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth";
import { searchUniverse } from "@/lib/market";

export async function GET(request: Request) {
  if (!(await getSession(request))) return unauthorized();
  try {
    const params = new URL(request.url).searchParams;
    const query = params.get("query") ?? "";
    const tickers = await searchUniverse(query, 8);
    return NextResponse.json({ tickers, count: tickers.length, query });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "종목 검색에 실패했습니다." },
      { status: 502 },
    );
  }
}
