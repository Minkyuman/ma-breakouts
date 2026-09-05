import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("service announcements are admin-authored and acknowledged once per signed-in user", async () => {
  const [schema, service, adminRoute, publicRoute, page] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/service-announcements.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/announcements/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/announcements/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /service_announcements/);
  assert.match(schema, /service_announcement_acknowledgements/);
  assert.match(schema, /service_announcement_ack_user_unique/);
  assert.match(service, /requireAdminAccount/);
  assert.match(service, /getUnreadServiceAnnouncements/);
  assert.match(service, /acknowledgeServiceAnnouncements/);
  assert.match(service, /isNull\(serviceAnnouncementAcknowledgements\.id\)/);
  assert.match(adminRoute, /admin_announcement_write/);
  assert.match(publicRoute, /getUnreadServiceAnnouncements/);
  assert.match(page, /LoginAnnouncementDialog/);
  assert.match(page, /로그인 공지/);
});
