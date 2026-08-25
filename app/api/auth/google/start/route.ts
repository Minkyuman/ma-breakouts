import { authBaseUrl, isGoogleAuthConfigured, stateCookie } from "@/lib/auth";

export async function GET(request: Request) {
  if (!isGoogleAuthConfigured()) {
    return Response.redirect(`${authBaseUrl(request)}/?auth_error=config`, 302);
  }
  const state = crypto.randomUUID().replaceAll("-", "");
  const redirectUri = `${authBaseUrl(request)}/api/auth/google/callback`;
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  authorization.searchParams.set("redirect_uri", redirectUri);
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", "openid email profile");
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("prompt", "select_account");
  return new Response(null, {
    status: 302,
    headers: { location: authorization.toString(), "set-cookie": stateCookie(state, request) },
  });
}
