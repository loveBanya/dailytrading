/** 공통 에러 메시지 추출 (Supabase PostgrestError 등) */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const o = err as { message?: string; error?: string; code?: string };
    if (o.message) return o.message;
    if (o.error) return o.error;
    try {
      return JSON.stringify(err);
    } catch {
      return "알 수 없는 오류";
    }
  }
  return String(err);
}

export function statusLabel(status: string): string {
  switch (status) {
    case "TP":
      return "익절";
    case "SL":
      return "손절";
    case "LIQUIDATED":
      return "청산";
    case "CLOSED":
      return "종료";
    default:
      return status;
  }
}

export function exchangeLabel(exchange: string): string {
  switch (exchange) {
    case "bybit":
      return "바이비트";
    case "binance":
      return "바이낸스";
    case "okx":
      return "OKX";
    default:
      return exchange;
  }
}

export function fearGreedKo(classification: string): string {
  const map: Record<string, string> = {
    "Extreme Fear": "극단적 공포",
    Fear: "공포",
    Neutral: "중립",
    Greed: "탐욕",
    "Extreme Greed": "극단적 탐욕",
  };
  return map[classification] ?? classification;
}
