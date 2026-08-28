import { closeDb, getDb } from "../db/index";
import { seasons } from "../db/schema";

if (process.env.ALLOW_DEV_SEED !== "true") {
  throw new Error("개발 시즌 생성은 ALLOW_DEV_SEED=true일 때만 실행할 수 있습니다.");
}

const database = getDb();

try {
  const [season] = await database
    .insert(seasons)
    .values({
      slug: "preseason-2026-01",
      name: "LINE BREAKER 프리시즌 2026",
      status: "open",
      startsAt: new Date("2026-08-01T00:00:00+09:00"),
      endsAt: new Date("2026-12-31T23:59:59+09:00"),
      initialCashKrw: "100000000.00",
      ruleVersion: 1,
    })
    .onConflictDoUpdate({
      target: seasons.slug,
      set: {
        name: "LINE BREAKER 프리시즌 2026",
        status: "open",
        startsAt: new Date("2026-08-01T00:00:00+09:00"),
        endsAt: new Date("2026-12-31T23:59:59+09:00"),
        initialCashKrw: "100000000.00",
        ruleVersion: 1,
        updatedAt: new Date(),
      },
    })
    .returning({ id: seasons.id, name: seasons.name });

  console.log(`개발 시즌 준비 완료: ${season.name} (${season.id})`);
} finally {
  await closeDb();
}
