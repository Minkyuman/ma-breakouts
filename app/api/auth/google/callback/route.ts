import {
  authBaseUrl,
  clearStateCookie,
  createSessionCookie,
  isGoogleAuthConfigured,
  oauthState,
} from "@/lib/auth";
import { registerAccessRequest } from "@/lib/access";

type GoogleTokenResponse = { access_token?: string; error?: string };
type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function failure(request: Request, reason: string) {
  return new Response(null, {
    status: 302,
    headers: {
      location: `${authBaseUrl(request)}/?auth_error=${encodeURIComponent(reason)}`,
      "set-cookie": clearStateCookie(request),
    },
  });
}

export async function GET(request: Request) {
  if (!isGoogleAuthConfigured()) return failure(request, "config");
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || state !== oauthState(request)) return failure(request, "state");

  try {
    const redirectUri = `${authBaseUrl(request)}/api/auth/google/callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    const token = await tokenResponse.json() as GoogleTokenResponse;
    if (!tokenResponse.ok || !token.access_token) return failure(request, "token");

    const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
    });
    const profile = await userResponse.json() as GoogleUserInfo;
    if (!userResponse.ok || !profile.sub || !profile.email || profile.email_verified !== true) {
      return failure(request, "profile");
    }
    const user = {
      sub: profile.sub,
      email: profile.email,
      name: profile.name || profile.email.split("@")[0],
      picture: profile.picture,
    };
    const access = await registerAccessRequest(user);
    const sessionCookie = await createSessionCookie({
      ...user,
      access,
    }, request);
    const headers = new Headers({ location: `${authBaseUrl(request)}/` });
    headers.append("set-cookie", sessionCookie);
    headers.append("set-cookie", clearStateCookie(request));
    return new Response(null, { status: 302, headers });
  } catch {
    return failure(request, "oauth");
  }
}
