export interface DayAccount {
  date: string;
  pnl: number;
  flow: number;
  equityStart: number;
  equityEnd: number;
}

/**
 * 자산 그래프와 같은 되돌림.
 * 지갑이 있으면 시작점 = 현재자산 − 실현손익 − 미실현 − 순입출금.
 * 지갑이 없으면 0에서 손익과 입출금만 쌓는다.
 */
export function buildDayAccounts(input: {
  daily: { date: string; pnl: number }[];
  flowByDay: Map<string, number>;
  liveEquity: number | null;
  liveUpl: number;
  totalPnl: number;
}): { rows: DayAccount[]; anchored: boolean } {
  const pnlByDay = new Map(input.daily.map((d) => [d.date, d.pnl]));
  const days = Array.from(
    new Set([...pnlByDay.keys(), ...input.flowByDay.keys()])
  ).sort();
  if (days.length === 0) return { rows: [], anchored: false };

  const anchored =
    input.liveEquity != null && Number.isFinite(input.liveEquity);
  let netExternal = 0;
  for (const net of input.flowByDay.values()) netExternal += net;
  let equity = anchored
    ? input.liveEquity! - input.totalPnl - input.liveUpl - netExternal
    : 0;

  const rows: DayAccount[] = [];
  for (const date of days) {
    const pnl = pnlByDay.get(date) ?? 0;
    const flow = input.flowByDay.get(date) ?? 0;
    const equityStart = equity;
    equity += pnl + flow;
    rows.push({ date, pnl, flow, equityStart, equityEnd: equity });
  }
  return { rows, anchored };
}
