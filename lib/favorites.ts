import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { favoriteListItems, favoriteLists, users } from "@/db/schema";
import type { AuthUser } from "@/lib/auth";
import type { AssetType, Market } from "@/lib/market";

const MAX_LISTS = 20;
const MAX_ITEMS_PER_LIST = 200;
const VALID_MARKETS = new Set<Market>(["KOSPI", "KOSDAQ", "NASDAQ", "NYSE", "AMEX"]);
const VALID_ASSET_TYPES = new Set<AssetType>(["STOCK", "ETF", "ETN"]);

export type FavoriteItem = {
  id: string;
  symbol: string;
  securityName: string;
  market: Market;
  nativeCurrency: "KRW" | "USD";
  assetType: AssetType;
  createdAt: string;
};

export type FavoriteList = {
  id: string;
  name: string;
  items: FavoriteItem[];
};

export class FavoriteError extends Error {
  constructor(
    public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "LIMIT_REACHED" | "NAME_TAKEN" | "LAST_LIST",
    message: string,
  ) {
    super(message);
    this.name = "FavoriteError";
  }
}

function normalizeListName(value: unknown) {
  if (typeof value !== "string") throw new FavoriteError("INVALID_INPUT", "즐겨찾기 이름을 입력해 주세요.");
  const name = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (name.length < 1 || name.length > 20) {
    throw new FavoriteError("INVALID_INPUT", "즐겨찾기 이름은 1~20자로 입력해 주세요.");
  }
  return name;
}

function normalizeItem(input: Record<string, unknown>) {
  const symbol = typeof input.symbol === "string" ? input.symbol.trim().toUpperCase() : "";
  const securityName = typeof input.securityName === "string" ? input.securityName.normalize("NFKC").trim() : "";
  const market = typeof input.market === "string" ? input.market.trim().toUpperCase() as Market : "" as Market;
  const assetType = typeof input.assetType === "string" ? input.assetType.trim().toUpperCase() as AssetType : "STOCK";
  const nativeCurrency = market === "KOSPI" || market === "KOSDAQ" ? "KRW" : "USD";
  const validSymbol = /^\d{6}$/u.test(symbol) || /^[A-Z][A-Z0-9.-]{0,15}$/u.test(symbol);
  if (!validSymbol || !securityName || securityName.length > 160 || !VALID_MARKETS.has(market) || !VALID_ASSET_TYPES.has(assetType)) {
    throw new FavoriteError("INVALID_INPUT", "즐겨찾기에 추가할 종목 정보를 확인해 주세요.");
  }
  return { symbol, securityName, market, nativeCurrency, assetType };
}

async function ensureAccount(authUser: AuthUser) {
  const database = getDb();
  const now = new Date();
  const [account] = await database
    .insert(users)
    .values({
      googleSub: authUser.sub,
      email: authUser.email.trim().toLowerCase(),
      displayName: authUser.name,
      avatarUrl: authUser.picture,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.googleSub,
      set: {
        email: authUser.email.trim().toLowerCase(),
        displayName: authUser.name,
        avatarUrl: authUser.picture,
        updatedAt: now,
      },
    })
    .returning({ id: users.id });
  return account;
}

async function ensureDefaultList(userId: string) {
  const database = getDb();
  await database
    .insert(favoriteLists)
    .values({ userId, name: "관심종목" })
    .onConflictDoNothing({ target: [favoriteLists.userId, favoriteLists.name] });
}

async function ownedList(userId: string, listId: unknown) {
  if (typeof listId !== "string" || !/^[0-9a-f-]{36}$/iu.test(listId)) {
    throw new FavoriteError("INVALID_INPUT", "즐겨찾기 목록을 확인해 주세요.");
  }
  const [list] = await getDb()
    .select()
    .from(favoriteLists)
    .where(and(eq(favoriteLists.id, listId), eq(favoriteLists.userId, userId)))
    .limit(1);
  if (!list) throw new FavoriteError("NOT_FOUND", "즐겨찾기 목록을 찾을 수 없습니다.");
  return list;
}

async function getFavoriteListsForAccount(userId: string): Promise<FavoriteList[]> {
  const database = getDb();
  let lists = await database
    .select()
    .from(favoriteLists)
    .where(eq(favoriteLists.userId, userId))
    .orderBy(asc(favoriteLists.sortOrder), asc(favoriteLists.createdAt));
  if (!lists.length) {
    await ensureDefaultList(userId);
    lists = await database
      .select()
      .from(favoriteLists)
      .where(eq(favoriteLists.userId, userId))
      .orderBy(asc(favoriteLists.sortOrder), asc(favoriteLists.createdAt));
  }
  const items = lists.length
    ? await database
        .select()
        .from(favoriteListItems)
        .where(inArray(favoriteListItems.listId, lists.map((list) => list.id)))
        .orderBy(asc(favoriteListItems.sortOrder), asc(favoriteListItems.createdAt))
    : [];
  return lists.map((list) => ({
    id: list.id,
    name: list.name,
    items: items.filter((item) => item.listId === list.id).map((item) => ({
      id: item.id,
      symbol: item.symbol,
      securityName: item.securityName,
      market: item.market as Market,
      nativeCurrency: item.nativeCurrency as "KRW" | "USD",
      assetType: item.assetType as AssetType,
      createdAt: item.createdAt.toISOString(),
    })),
  }));
}

export async function getFavoriteLists(authUser: AuthUser): Promise<FavoriteList[]> {
  const account = await ensureAccount(authUser);
  return getFavoriteListsForAccount(account.id);
}

export async function mutateFavorites(authUser: AuthUser, input: Record<string, unknown>) {
  const account = await ensureAccount(authUser);
  const database = getDb();
  const action = input.action;

  if (action === "create_list") {
    const name = normalizeListName(input.name);
    const [{ count }] = await database.select({ count: sql<number>`count(*)::int` }).from(favoriteLists).where(eq(favoriteLists.userId, account.id));
    if (count >= MAX_LISTS) throw new FavoriteError("LIMIT_REACHED", `즐겨찾기 목록은 최대 ${MAX_LISTS}개까지 만들 수 있습니다.`);
    await database.insert(favoriteLists).values({ userId: account.id, name, sortOrder: count });
  } else if (action === "rename_list") {
    const list = await ownedList(account.id, input.listId);
    await database.update(favoriteLists).set({ name: normalizeListName(input.name), updatedAt: new Date() }).where(eq(favoriteLists.id, list.id));
  } else if (action === "delete_list") {
    const list = await ownedList(account.id, input.listId);
    const [{ count }] = await database.select({ count: sql<number>`count(*)::int` }).from(favoriteLists).where(eq(favoriteLists.userId, account.id));
    if (count <= 1) throw new FavoriteError("LAST_LIST", "마지막 즐겨찾기 목록은 삭제할 수 없습니다.");
    await database.delete(favoriteLists).where(eq(favoriteLists.id, list.id));
  } else if (action === "add_item") {
    const list = await ownedList(account.id, input.listId);
    const item = normalizeItem(input);
    const [{ count }] = await database.select({ count: sql<number>`count(*)::int` }).from(favoriteListItems).where(eq(favoriteListItems.listId, list.id));
    if (count >= MAX_ITEMS_PER_LIST) throw new FavoriteError("LIMIT_REACHED", `한 목록에는 최대 ${MAX_ITEMS_PER_LIST}종목까지 저장할 수 있습니다.`);
    await database.insert(favoriteListItems).values({ listId: list.id, ...item, sortOrder: count }).onConflictDoNothing({ target: [favoriteListItems.listId, favoriteListItems.symbol, favoriteListItems.market] });
  } else if (action === "remove_item") {
    const list = await ownedList(account.id, input.listId);
    if (typeof input.itemId !== "string") throw new FavoriteError("INVALID_INPUT", "삭제할 종목을 확인해 주세요.");
    await database.delete(favoriteListItems).where(and(eq(favoriteListItems.id, input.itemId), eq(favoriteListItems.listId, list.id)));
  } else {
    throw new FavoriteError("INVALID_INPUT", "즐겨찾기 요청을 확인해 주세요.");
  }

  return getFavoriteListsForAccount(account.id);
}
