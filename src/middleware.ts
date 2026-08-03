import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  getAuthConfig,
  verifySessionToken,
} from "@/lib/auth/session";

/** 검색엔진·스크래퍼·AI 봇 UA */
const BOT_UA =
  /bot|spider|crawl|slurp|facebookexternalhit|embedly|quora|pinterest|redditbot|ahrefs|semrush|mj12|dotbot|petalbot|bytespider|gptbot|claudebot|anthropic|ccbot|google-extended|amazonbot|applebot|yandex|baidu|duckduck|ia_archiver|wget|curl\/|python-requests|scrapy|httpclient|libwww|java\/|go-http|okhttp|headless|phantom|selenium/i;

/** IP/키 기준 간단 레이트리밋 (인스턴스 메모리) */
const hits = new Map<string, { n: number; reset: number }>();
const WINDOW_MS = 60_000;
const MAX_API_PER_MIN = 90;
const MAX_PAGE_PER_MIN = 120;

function clientKey(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function limited(key: string, max: number): boolean {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || now > cur.reset) {
    hits.set(key, { n: 1, reset: now + WINDOW_MS });
    return false;
  }
  cur.n += 1;
  return cur.n > max;
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon-") ||
    pathname === "/api/auth/login"
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ua = req.headers.get("user-agent") ?? "";

  if (
    pathname === "/robots.txt" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon-") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon-")
  ) {
    return NextResponse.next();
  }

  if (BOT_UA.test(ua) || (ua.trim() === "" && pathname.startsWith("/api/"))) {
    return new NextResponse("Forbidden", {
      status: 403,
      headers: {
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }

  const ip = clientKey(req);
  const isApi = pathname.startsWith("/api/");
  if (
    limited(
      `${isApi ? "api" : "page"}:${ip}`,
      isApi ? MAX_API_PER_MIN : MAX_PAGE_PER_MIN
    )
  ) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." },
      { status: 429 }
    );
  }

  const cfg = getAuthConfig();
  if (cfg && !isPublicPath(pathname)) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const ok =
      token != null &&
      (await verifySessionToken(token, cfg.secret, cfg.user));

    if (!ok) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // 이미 로그인된 채 /login 이면 홈으로
  if (cfg && pathname === "/login") {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (token && (await verifySessionToken(token, cfg.secret, cfg.user))) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
