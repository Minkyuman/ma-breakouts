import { getSession, unauthorized } from "@/lib/auth";
import { acknowledgeServiceAnnouncements, getUnreadServiceAnnouncements, ServiceAnnouncementError } from "@/lib/service-announcements";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    return Response.json({ announcements: await getUnreadServiceAnnouncements(user) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "공지사항을 불러오지 못했습니다." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getSession(request);
  if (!user) return unauthorized();
  try {
    const payload = await request.json() as { ids?: unknown };
    await acknowledgeServiceAnnouncements(user, payload.ids);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof ServiceAnnouncementError ? error.message : "공지 확인을 저장하지 못했습니다.";
    return Response.json({ error: message }, { status: 400 });
  }
}
