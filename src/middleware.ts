import { NextRequest, NextResponse } from "next/server";

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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ua = req.headers.get("user-agent") ?? "";

  // 정적/robots 는 통과 (robots.txt 자체는 봇이 읽어야 Disallow 적용)
  if (
    pathname === "/robots.txt" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // 봇 차단 (robots.txt 제외). 빈 UA는 API만 차단 (일부 브라우저는 UA 숨김)
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
  if (limited(`${isApi ? "api" : "page"}:${ip}`, isApi ? MAX_API_PER_MIN : MAX_PAGE_PER_MIN)) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." },
      { status: 429 }
    );
  }

  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export const config = {
  matcher: [
    /*
     * 정적 파일 일부 제외하고 전부
     */
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
