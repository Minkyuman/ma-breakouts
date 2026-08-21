import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "MA BREAKOUTS — 선 넘네.. 한국 주식 이평 돌파 차트";
const description =
  "전일·전주·전월 흐름과 MA10·MA240 돌파를 한눈에 확인하는 한국 주식 차트 스크리너.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ko_KR",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "선 넘네.. 주식 차트" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
