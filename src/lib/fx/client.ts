export interface FxQuote {
  rate: number;
  source: "upbit" | "usd";
}

export async function fetchFxRate(): Promise<FxQuote | null> {
  try {
    const res = await fetch("/api/fx");
    const data = (await res.json()) as { rate?: number; source?: string; error?: string };
    const rate = Number(data.rate);
    if (!res.ok || !(rate > 0)) return null;
    return {
      rate,
      source: data.source === "usd" ? "usd" : "upbit",
    };
  } catch {
    return null;
  }
}
