import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("named favorites are private, bounded, and navigate back to charts", async () => {
  const [schema, migration, favorites, route, page] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_late_thundra.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/favorites.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/favorites/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /favoriteLists/);
  assert.match(schema, /favoriteListItems/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /favorite_lists_user_name_unique/);
  assert.match(migration, /favorite_list_items_security_unique/);
  assert.match(favorites, /users\.googleSub/);
  assert.match(favorites, /eq\(favoriteLists\.userId, account\.id\)/);
  assert.match(favorites, /MAX_LISTS = 20/);
  assert.match(favorites, /MAX_ITEMS_PER_LIST = 200/);
  assert.match(favorites, /마지막 즐겨찾기 목록은 삭제할 수 없습니다/);
  assert.match(route, /getSession\(request\)/);
  assert.match(route, /unauthorized\(\)/);
  assert.match(page, /FavoriteDialog/);
  assert.match(page, /openSavedSecurityChart/);
  assert.match(page, /favorite-item-remove/);
  assert.match(page, /selectedIsFavorite/);
  assert.match(page, /aria-pressed=\{selectedIsFavorite\}/);
  assert.match(page, /즐겨찾기됨/);
  assert.match(page, /initialLists=\{favoriteLists\}/);
  assert.match(page, /if \(initialLists !== null\)/);
  assert.match(favorites, /getFavoriteListsForAccount\(account\.id\)/);
});
