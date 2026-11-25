import type { NextRequest } from "next/server";

/** Cron / 수동 틱 요청 인증. PAPER_CRON_SECRET 과 Bearer 또는 x-cron-secret 비교. */
export function assertPaperCronAuth(req: NextRequest): void {
  const secret = process.env.PAPER_CRON_SECRET?.trim();
  if (!secret) {
    throw new PaperAuthError(
      "PAPER_CRON_SECRET 이 설정되지 않았습니다 (.env.local).",
      503
    );
  }

  const header =
    req.headers.get("x-cron-secret")?.trim() ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    req.nextUrl.searchParams.get("secret")?.trim() ||
    "";

  if (!header || header !== secret) {
    throw new PaperAuthError("크론 인증 실패", 401);
  }
}

export class PaperAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
