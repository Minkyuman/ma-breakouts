import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";

const outputRoot = resolve(".vercel/output");
const staticRoot = resolve(outputRoot, "static");
const functionEntry = resolve(outputRoot, "functions/__server.func/index.mjs");
const port = Number(process.env.PORT || 3000);

if (!existsSync(functionEntry)) {
  throw new Error("Vercel 빌드가 없습니다. NITRO_PRESET=vercel npm run build를 먼저 실행해 주세요.");
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT는 1~65535 사이의 정수여야 합니다.");
}

const { default: application } = await import(functionEntry);

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function staticFile(pathname: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const candidate = resolve(staticRoot, decoded.replace(/^\/+/, ""));
  if (candidate !== staticRoot && !candidate.startsWith(`${staticRoot}${sep}`)) return null;
  try {
    const info = await stat(candidate);
    return info.isFile() ? { path: candidate, size: info.size } : null;
  } catch {
    return null;
  }
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const origin = `http://${incoming.headers.host || `localhost:${port}`}`;
    const url = new URL(incoming.url || "/", origin);
    const asset = await staticFile(url.pathname);
    if (asset && (incoming.method === "GET" || incoming.method === "HEAD")) {
      outgoing.statusCode = 200;
      outgoing.setHeader("content-length", asset.size);
      outgoing.setHeader("content-type", contentTypes[extname(asset.path).toLowerCase()] || "application/octet-stream");
      outgoing.setHeader("cache-control", url.pathname.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "public, max-age=3600");
      if (incoming.method === "HEAD") return outgoing.end();
      return createReadStream(asset.path).pipe(outgoing);
    }

    const requestHeaders = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) value.forEach((item) => requestHeaders.append(name, item));
      else if (value !== undefined) requestHeaders.set(name, value);
    }
    const method = incoming.method || "GET";
    const request = new Request(url, {
      method,
      headers: requestHeaders,
      body: method === "GET" || method === "HEAD" ? undefined : Readable.toWeb(incoming) as ReadableStream,
      ...(method === "GET" || method === "HEAD" ? {} : { duplex: "half" as const }),
    });
    const response = await application.fetch(request, { waitUntil() {} });
    outgoing.statusCode = response.status;
    outgoing.statusMessage = response.statusText;
    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    const setCookies = response.headers.getSetCookie?.() ?? [];
    if (setCookies.length) outgoing.setHeader("set-cookie", setCookies);
    if (!response.body || method === "HEAD") return outgoing.end();
    Readable.fromWeb(response.body as ReadableStream).pipe(outgoing);
  } catch (error) {
    console.error("Local Vercel preview request failed", error);
    if (!outgoing.headersSent) {
      outgoing.statusCode = 500;
      outgoing.setHeader("content-type", "application/json; charset=utf-8");
    }
    outgoing.end(JSON.stringify({ error: "로컬 Vercel 미리보기 요청에 실패했습니다." }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Vercel Node preview: http://localhost:${port}`);
});
