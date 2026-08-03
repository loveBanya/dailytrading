import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  SESSION_MAX_AGE,
  createSessionToken,
  getAuthConfig,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const cfg = getAuthConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "인증이 설정되지 않았습니다 (APP_AUTH_USER/PASSWORD)" },
      { status: 503 }
    );
  }

  let body: { username?: string; password?: string; remember?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";
  const remember = Boolean(body.remember);

  if (username !== cfg.user || password !== cfg.password) {
    return NextResponse.json(
      { error: "아이디 또는 비밀번호가 올바르지 않습니다" },
      { status: 401 }
    );
  }

  const maxAge = remember ? SESSION_MAX_AGE.remember : SESSION_MAX_AGE.session;
  const token = await createSessionToken(cfg.user, cfg.secret, maxAge);

  const res = NextResponse.json({ ok: true, remember });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}
