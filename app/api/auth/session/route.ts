import { currentAccessStatus } from "@/lib/access";
import { createSessionCookie, getRawSession, isGoogleAuthConfigured } from "@/lib/auth";

export async function GET(request: Request) {
  const configured = isGoogleAuthConfigured();
  const user = configured ? await getRawSession(request) : null;
  if (!user) return Response.json({ authenticated: false, configured, user: null }, { headers: { "cache-control": "no-store" } });
  try {
    const accessStatus = await currentAccessStatus(user);
    const response = Response.json(
      { authenticated: accessStatus === "approved", configured, accessStatus, user },
      { headers: { "cache-control": "no-store" } },
    );
    if (user.access !== accessStatus) {
      response.headers.append("set-cookie", await createSessionCookie({ ...user, access: accessStatus }, request));
    }
    return response;
  } catch {
    return Response.json({ authenticated: false, configured, accessStatus: "pending", user }, { headers: { "cache-control": "no-store" } });
  }
}
