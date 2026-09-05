import { getSession, unauthorized } from "@/lib/auth";
import { fetchNasdaq100Membership, fetchSecurityClassification, type AssetType, type Market, type Ticker } from "@/lib/market";

export const runtime = "nodejs";

const MAX_ITEMS = 100;
const ALLOWED_MARKETS = new Set<Market>(["NASDAQ", "NYSE", "AMEX", "US_ETF", "KOSPI", "KOSDAQ"]);
const ALLOWED_ASSET_TYPES = new Set<AssetType>(["STOCK", "ETF", "ETN", "INDEX"]);

type ClassificationRequestItem = Pick<Ticker, "code" | "name" | "market" | "assetType">;

function parseItems(input: unknown): ClassificationRequestItem[] {
  if (!input || typeof input !== "object" || !Array.isArray((input as { items?: unknown }).items)) return [];
  const seen = new Set<string>();
  return (input as { items: unknown[] }).items.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Partial<ClassificationRequestItem>;
    const code = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const market = row.market;
    const assetType = row.assetType;
    const key = `${String(market)}:${code}`;
    if (!code || !name || typeof market !== "string" || !ALLOWED_MARKETS.has(market as Market) || typeof assetType !== "string" || !ALLOWED_ASSET_TYPES.has(assetType as AssetType) || seen.has(key)) return [];
    seen.add(key);
    return [{ code, name, market: market as Market, assetType: assetType as AssetType }];
  }).slice(0, MAX_ITEMS);
}

export async function POST(request: Request) {
  if (!(await getSession(request))) return unauthorized();
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const items = parseItems(input);
  if (!items.length) return Response.json({ items: [] }, { headers: { "cache-control": "no-store" } });

  const results: Array<ClassificationRequestItem & { sector?: string; industry?: string; themes?: string[]; isNasdaq100?: boolean; classificationStatus: "ready" | "unavailable" }> = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(6, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      try {
        const classification = await fetchSecurityClassification(item);
        let isNasdaq100: boolean | undefined;
        if (item.market === "NASDAQ" && item.assetType === "STOCK") {
          try {
            isNasdaq100 = await fetchNasdaq100Membership(item.code);
          } catch {
            // Optional index metadata must not discard a valid profile.
          }
        }
        const hasClassification = Boolean(classification.sector || classification.industry || classification.themes?.length);
        results.push({ ...item, ...classification, isNasdaq100, classificationStatus: hasClassification ? "ready" : "unavailable" });
      } catch {
        results.push({ ...item, classificationStatus: "unavailable" });
      }
    }
  });
  await Promise.all(workers);
  return Response.json({ items: results }, { headers: { "cache-control": "no-store" } });
}
