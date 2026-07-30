import type { Trade } from "@/lib/exchanges/types";

interface StatsBarProps {
  trades: Trade[];
}

export function StatsBar({ trades }: StatsBarProps) {
  const totalPnl = trades.reduce((s, t) => s + Number(t.pnl), 0);
  const wins = trades.filter((t) => Number(t.pnl) > 0).length;
  const losses = trades.filter((t) => Number(t.pnl) < 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Stat label="총 손익" value={`${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`} positive={totalPnl >= 0} />
      <Stat label="거래 수" value={`${trades.length}`} />
      <Stat label="승 / 패" value={`${wins} / ${losses}`} />
      <Stat label="승률" value={`${winRate.toFixed(0)}%`} />
    </div>
  );
}

function Stat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          positive === undefined
            ? "text-zinc-100"
            : positive
              ? "text-emerald-400"
              : "text-rose-400"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
