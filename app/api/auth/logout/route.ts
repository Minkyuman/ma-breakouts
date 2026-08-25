import { authBaseUrl, clearSessionCookie } from "@/lib/auth";

export async function GET(request: Request) {
  return new Response(null, {
    status: 302,
    headers: { location: `${authBaseUrl(request)}/`, "set-cookie": clearSessionCookie(request) },
  });
}
