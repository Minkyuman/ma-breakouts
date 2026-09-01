import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { accessRequests, auditEvents } from "@/db/schema";
import { isEmailAllowed, type AuthUser } from "@/lib/auth";
import { requireAdminAccount } from "@/lib/game-admin";

export type AccessStatus = "pending" | "approved" | "rejected";

export class AccessRequestError extends Error {
  constructor(public readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID_STATUS", message: string) {
    super(message);
    this.name = "AccessRequestError";
  }
}

// The production migration has created this storage. Keep the call sites
// asynchronous without running DDL on each serverless cold start.
async function ensureAccessStorage() {}

function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function registerAccessRequest(user: Pick<AuthUser, "sub" | "email" | "name">): Promise<AccessStatus> {
  if (isEmailAllowed(user.email)) return "approved";
  await ensureAccessStorage();
  const database = getDb();
  const email = normalizedEmail(user.email);
  const [existing] = await database
    .select({ status: accessRequests.status })
    .from(accessRequests)
    .where(eq(accessRequests.googleSub, user.sub))
    .limit(1);
  if (existing) {
    await database.update(accessRequests).set({ email, displayName: user.name, updatedAt: new Date() })
      .where(eq(accessRequests.googleSub, user.sub));
    return existing.status;
  }
  const [byEmail] = await database
    .select({ id: accessRequests.id, status: accessRequests.status })
    .from(accessRequests)
    .where(eq(accessRequests.email, email))
    .limit(1);
  if (byEmail) {
    await database.update(accessRequests).set({ googleSub: user.sub, displayName: user.name, updatedAt: new Date() })
      .where(eq(accessRequests.id, byEmail.id));
    return byEmail.status;
  }
  await database.insert(accessRequests).values({ googleSub: user.sub, email, displayName: user.name });
  return "pending";
}

export async function currentAccessStatus(user: Pick<AuthUser, "sub" | "email" | "name">): Promise<AccessStatus> {
  return registerAccessRequest(user);
}

export async function getAccessRequestOverview(authUser: AuthUser) {
  await requireAdminAccount(authUser);
  await ensureAccessStorage();
  const database = getDb();
  const rows = await database
    .select({ id: accessRequests.id, email: accessRequests.email, displayName: accessRequests.displayName, status: accessRequests.status, requestedAt: accessRequests.requestedAt, decidedAt: accessRequests.decidedAt })
    .from(accessRequests)
    .orderBy(desc(accessRequests.requestedAt))
    .limit(100);
  return rows.map((row) => ({ ...row, requestedAt: row.requestedAt.toISOString(), decidedAt: row.decidedAt?.toISOString() ?? null }));
}

export async function decideAccessRequest(authUser: AuthUser, id: unknown, status: unknown, requestId: string) {
  const account = await requireAdminAccount(authUser);
  await ensureAccessStorage();
  if (typeof id !== "string" || !id) throw new AccessRequestError("NOT_FOUND", "접근 요청을 찾을 수 없습니다.");
  if (status !== "approved" && status !== "rejected") throw new AccessRequestError("INVALID_STATUS", "승인 또는 거절만 선택할 수 있습니다.");
  const database = getDb();
  const [updated] = await database.transaction(async (transaction) => {
    const [request] = await transaction.update(accessRequests)
      .set({ status, decidedAt: new Date(), decidedByUserId: account.id, updatedAt: new Date() })
      .where(eq(accessRequests.id, id))
      .returning({ id: accessRequests.id, email: accessRequests.email, status: accessRequests.status, requestedAt: accessRequests.requestedAt, decidedAt: accessRequests.decidedAt });
    if (!request) throw new AccessRequestError("NOT_FOUND", "접근 요청을 찾을 수 없습니다.");
    await transaction.insert(auditEvents).values({
      actorUserId: account.id,
      action: `access_request.${status}`,
      targetType: "access_request",
      targetId: request.id,
      requestId,
      metadata: { status },
    });
    return [request];
  });
  return { ...updated, requestedAt: updated.requestedAt.toISOString(), decidedAt: updated.decidedAt?.toISOString() ?? null };
}
