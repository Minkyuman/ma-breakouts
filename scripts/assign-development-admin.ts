import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../db/index";
import { auditEvents, users } from "../db/schema";

const targetEmail = process.env.TARGET_ADMIN_EMAIL?.normalize("NFKC").trim().toLowerCase();
const expectedProjectRef = process.env.EXPECTED_DEV_PROJECT_REF?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();

if (process.env.ALLOW_DEV_ADMIN_ASSIGNMENT !== "true") {
  throw new Error("Development 관리자 지정은 ALLOW_DEV_ADMIN_ASSIGNMENT=true일 때만 실행할 수 있습니다.");
}
if (!targetEmail || !targetEmail.includes("@")) {
  throw new Error("TARGET_ADMIN_EMAIL에 기존 로그인 계정의 이메일을 입력해 주세요.");
}
if (!expectedProjectRef || !databaseUrl?.includes(expectedProjectRef)) {
  throw new Error("연결된 데이터베이스가 EXPECTED_DEV_PROJECT_REF와 일치하지 않습니다.");
}

const database = getDb();
const requestId = `admin-bootstrap-${randomUUID()}`;

try {
  const outcome = await database.transaction(async (transaction) => {
    const accounts = await transaction
      .select({
        id: users.id,
        role: users.role,
        displayName: users.displayName,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${targetEmail}`)
      .limit(2)
      .for("update");

    if (accounts.length === 0) {
      throw new Error("해당 이메일로 생성된 리그 계정이 없습니다. 먼저 로그인 후 리그에 한 번 진입해 주세요.");
    }
    if (accounts.length > 1) {
      throw new Error("같은 이메일의 리그 계정이 둘 이상입니다. Google sub 기준으로 수동 확인이 필요합니다.");
    }

    const [account] = accounts;
    if (account.role === "admin") {
      return { changed: false, displayName: account.displayName };
    }

    await transaction
      .update(users)
      .set({ role: "admin", updatedAt: new Date() })
      .where(sql`${users.id} = ${account.id}`);

    await transaction.insert(auditEvents).values({
      actorUserId: account.id,
      action: "user.admin_assigned",
      targetType: "user",
      targetId: account.id,
      requestId,
      metadata: {
        previousRole: account.role,
        newRole: "admin",
        mechanism: "guarded-development-bootstrap",
        environment: "development",
      },
    });

    return { changed: true, displayName: account.displayName };
  });

  const status = outcome.changed ? "관리자 지정 완료" : "이미 관리자로 지정됨";
  console.log(`${status}: ${outcome.displayName || "이름 미등록"} (request ${requestId})`);
} finally {
  await closeDb();
}
