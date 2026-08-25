const SESSION_COOKIE = "line_breaker_session";
const OAUTH_STATE_COOKIE = "line_breaker_oauth_state";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const STATE_MAX_AGE = 60 * 10;

export type AuthUser = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  exp: number;
};

function encodeBase64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeText(value: string) {
  return new TextDecoder().decode(decodeBase64Url(value));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(value: string, secret: string) {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(value));
  return encodeBase64Url(new Uint8Array(signature));
}

async function verify(value: string, signature: string, secret: string) {
  try {
    return crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      decodeBase64Url(signature),
      new TextEncoder().encode(value),
    );
  } catch {
    return false;
  }
}

export function isGoogleAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.AUTH_SECRET);
}

export function isEmailAllowed(email: string) {
  const configured = process.env.AUTH_ALLOWED_EMAILS?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return !configured?.length || configured.includes(email.trim().toLowerCase());
}

export function authBaseUrl(request: Request) {
  return (process.env.AUTH_BASE_URL || new URL(request.url).origin).replace(/\/$/u, "");
}

export function parseCookies(request: Request) {
  const values = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) values.set(key, decodeURIComponent(value));
  }
  return values;
}

function cookie(name: string, value: string, maxAge: number, secure: boolean) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export function stateCookie(value: string, request: Request) {
  return cookie(OAUTH_STATE_COOKIE, value, STATE_MAX_AGE, authBaseUrl(request).startsWith("https://"));
}

export function clearStateCookie(request: Request) {
  return cookie(OAUTH_STATE_COOKIE, "", 0, authBaseUrl(request).startsWith("https://"));
}

export function oauthState(request: Request) {
  return parseCookies(request).get(OAUTH_STATE_COOKIE) ?? null;
}

export async function createSessionCookie(user: Omit<AuthUser, "exp">, request: Request) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET이 설정되지 않았습니다.");
  const payload = encodeBase64Url(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE }));
  const token = `${payload}.${await sign(payload, secret)}`;
  return cookie(SESSION_COOKIE, token, SESSION_MAX_AGE, authBaseUrl(request).startsWith("https://"));
}

export function clearSessionCookie(request: Request) {
  return cookie(SESSION_COOKIE, "", 0, authBaseUrl(request).startsWith("https://"));
}

export async function getSession(request: Request): Promise<AuthUser | null> {
  const secret = process.env.AUTH_SECRET;
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!secret || !token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !(await verify(payload, signature, secret))) return null;
  try {
    const user = JSON.parse(decodeText(payload)) as AuthUser;
    if (!user.sub || !user.email || !user.name || !user.exp || user.exp <= Math.floor(Date.now() / 1000)) return null;
    return user;
  } catch {
    return null;
  }
}

export function unauthorized() {
  return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
}
