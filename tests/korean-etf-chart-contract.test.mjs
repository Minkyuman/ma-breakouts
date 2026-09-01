import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Korean ETF chart and analysis APIs accept Naver's six-character alphanumeric issue codes", async () => {
  const [chartRoute, analysisRoute] = await Promise.all([
    readFile(new URL("../app/api/chart/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analysis/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(chartRoute, /\^\[A-Z0-9\]\{6\}\$/);
  assert.match(analysisRoute, /\^\[A-Z0-9\]\{6\}\$/);
  assert.match(chartRoute, /0117V0/);
  assert.match(analysisRoute, /0101N0/);
});
