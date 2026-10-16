export type DisplayCurrency = "usdt" | "krw";

export function formatDisplayMoney(
  usdt: number,
  currency: DisplayCurrency,
  fx: number,
  signed = false
): string {
  const rate = fx > 0 ? fx : 1350;
  if (!Number.isFinite(usdt)) return "—";
  if (currency === "krw") {
    const won = Math.round(usdt * rate);
    const body = `₩${Math.abs(won).toLocaleString("ko-KR")}`;
    if (signed) {
      if (won > 0) return `+${body}`;
      if (won < 0) return `-${body}`;
      return body;
    }
    return usdt < 0 ? `-${body}` : body;
  }
  const body = `$${Math.abs(usdt).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  if (signed) {
    if (usdt > 0) return `+${body}`;
    if (usdt < 0) return `-${body}`;
    return body;
  }
  return usdt < 0 ? `-${body}` : body;
}
