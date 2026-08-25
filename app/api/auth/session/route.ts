import { getSession, isGoogleAuthConfigured } from "@/lib/auth";

export async function GET(request: Request) {
  const configured = isGoogleAuthConfigured();
  const user = configured ? await getSession(request) : null;
  return Response.json(
    { authenticated: Boolean(user), configured, user },
    { headers: { "cache-control": "no-store" } },
  );
}
