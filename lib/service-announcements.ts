import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { auditEvents, serviceAnnouncementAcknowledgements, serviceAnnouncements } from "@/db/schema";
import { requireAdminAccount } from "@/lib/game-admin";
import type { AuthUser } from "@/lib/auth";

export type ServiceAnnouncement = {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  expiresAt: string | null;
};

export type AdminServiceAnnouncement = ServiceAnnouncement & {
  isPublished: boolean;
  createdAt: string;
};

export class ServiceAnnouncementError extends Error {
  constructor(public readonly code: "FORBIDDEN" | "INVALID_INPUT" | "NOT_FOUND", message: string) {
    super(message);
  }
}

let storageReady: Promise<void> | null = null;

/** Provisioning is normally handled by migration 0016; this keeps older deployments safe. */
async function ensureServiceAnnouncementStorage() {
  if (!storageReady) {
    storageReady = getDb().transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(49281601)`);
      await transaction.execute(sql`create table if not exists service_announcements (
        id uuid primary key default gen_random_uuid(), title varchar(120) not null, body text not null,
        is_published boolean not null default false, published_at timestamptz, expires_at timestamptz,
        created_by_user_id uuid references users(id) on delete set null,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      )`);
      await transaction.execute(sql`create index if not exists service_announcements_visible_idx on service_announcements (is_published, published_at)`);
      await transaction.execute(sql`create table if not exists service_announcement_acknowledgements (
        id uuid primary key default gen_random_uuid(), announcement_id uuid not null references service_announcements(id) on delete cascade,
        google_sub text not null, acknowledged_at timestamptz not null default now(), unique (announcement_id, google_sub)
      )`);
      await transaction.execute(sql`create index if not exists service_announcement_ack_user_idx on service_announcement_acknowledgements (google_sub, acknowledged_at)`);
      await transaction.execute(sql`alter table service_announcements enable row level security`);
      await transaction.execute(sql`alter table service_announcement_acknowledgements enable row level security`);
    }).then(() => undefined).catch((error) => {
      storageReady = null;
      throw error;
    });
  }
  return storageReady;
}

function asPublic(row: typeof serviceAnnouncements.$inferSelect): ServiceAnnouncement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

function normalizeTitle(value: unknown) {
  const title = typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/gu, " ") : "";
  if (title.length < 2 || title.length > 120) throw new ServiceAnnouncementError("INVALID_INPUT", "공지 제목은 2자 이상 120자 이하로 입력해 주세요.");
  return title;
}

function normalizeBody(value: unknown) {
  const body = typeof value === "string" ? value.normalize("NFKC").trim() : "";
  if (body.length < 2 || body.length > 3_000) throw new ServiceAnnouncementError("INVALID_INPUT", "공지 본문은 2자 이상 3,000자 이하로 입력해 주세요.");
  return body;
}

function optionalFutureDate(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ServiceAnnouncementError("INVALID_INPUT", "게시 종료 시각 형식이 올바르지 않습니다.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date <= new Date()) throw new ServiceAnnouncementError("INVALID_INPUT", "게시 종료 시각은 현재보다 미래여야 합니다.");
  return date;
}

export async function getUnreadServiceAnnouncements(user: AuthUser): Promise<ServiceAnnouncement[]> {
  await ensureServiceAnnouncementStorage();
  const now = new Date();
  const rows = await getDb()
    .select({ announcement: serviceAnnouncements, acknowledgementId: serviceAnnouncementAcknowledgements.id })
    .from(serviceAnnouncements)
    .leftJoin(serviceAnnouncementAcknowledgements, and(
      eq(serviceAnnouncementAcknowledgements.announcementId, serviceAnnouncements.id),
      eq(serviceAnnouncementAcknowledgements.googleSub, user.sub),
    ))
    .where(and(
      eq(serviceAnnouncements.isPublished, true),
      or(isNull(serviceAnnouncements.expiresAt), gt(serviceAnnouncements.expiresAt, now)),
      isNull(serviceAnnouncementAcknowledgements.id),
    ))
    .orderBy(desc(serviceAnnouncements.publishedAt), desc(serviceAnnouncements.createdAt))
    .limit(3);
  return rows.map((row) => asPublic(row.announcement));
}

export async function acknowledgeServiceAnnouncements(user: AuthUser, ids: unknown) {
  await ensureServiceAnnouncementStorage();
  const announcementIds = Array.isArray(ids)
    ? [...new Set(ids.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/iu.test(id)))].slice(0, 3)
    : [];
  if (!announcementIds.length) throw new ServiceAnnouncementError("INVALID_INPUT", "확인할 공지를 선택해 주세요.");
  const now = new Date();
  await getDb().insert(serviceAnnouncementAcknowledgements).values(
    announcementIds.map((announcementId) => ({ announcementId, googleSub: user.sub, acknowledgedAt: now })),
  ).onConflictDoNothing();
}

export async function getAdminServiceAnnouncements(user: AuthUser): Promise<AdminServiceAnnouncement[]> {
  await requireAdminAccount(user);
  await ensureServiceAnnouncementStorage();
  const rows = await getDb().select().from(serviceAnnouncements).orderBy(desc(serviceAnnouncements.createdAt)).limit(30);
  return rows.map((row) => ({ ...asPublic(row), isPublished: row.isPublished, createdAt: row.createdAt.toISOString() }));
}

export async function createServiceAnnouncement(user: AuthUser, input: Record<string, unknown>, requestId: string) {
  const admin = await requireAdminAccount(user);
  await ensureServiceAnnouncementStorage();
  const title = normalizeTitle(input.title);
  const body = normalizeBody(input.body);
  const expiresAt = optionalFutureDate(input.expiresAt);
  const publishNow = input.publishNow !== false;
  const now = new Date();
  const [created] = await getDb().transaction(async (transaction) => {
    const [announcement] = await transaction.insert(serviceAnnouncements).values({
      title, body, expiresAt, isPublished: publishNow, publishedAt: publishNow ? now : null, createdByUserId: admin.id, createdAt: now, updatedAt: now,
    }).returning();
    await transaction.insert(auditEvents).values({
      actorUserId: admin.id, action: "announcement.created", targetType: "service_announcement", targetId: announcement.id, requestId,
      metadata: { title, published: publishNow, expiresAt: expiresAt?.toISOString() ?? null },
    });
    return [announcement];
  });
  return { ...asPublic(created), isPublished: created.isPublished, createdAt: created.createdAt.toISOString() };
}

export async function setServiceAnnouncementPublication(user: AuthUser, id: unknown, publish: unknown, requestId: string) {
  const admin = await requireAdminAccount(user);
  await ensureServiceAnnouncementStorage();
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/iu.test(id) || typeof publish !== "boolean") {
    throw new ServiceAnnouncementError("INVALID_INPUT", "공지 상태 요청이 올바르지 않습니다.");
  }
  const now = new Date();
  const [updated] = await getDb().transaction(async (transaction) => {
    const [announcement] = await transaction.update(serviceAnnouncements)
      .set({ isPublished: publish, publishedAt: publish ? now : null, updatedAt: now })
      .where(eq(serviceAnnouncements.id, id))
      .returning();
    if (!announcement) throw new ServiceAnnouncementError("NOT_FOUND", "공지를 찾을 수 없습니다.");
    await transaction.insert(auditEvents).values({
      actorUserId: admin.id, action: publish ? "announcement.published" : "announcement.unpublished", targetType: "service_announcement", targetId: id, requestId, metadata: { published: publish },
    });
    return [announcement];
  });
  return { ...asPublic(updated), isPublished: updated.isPublished, createdAt: updated.createdAt.toISOString() };
}
