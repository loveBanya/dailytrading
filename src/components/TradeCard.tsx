import type { Trade } from "@/lib/exchanges/types";
import {
  formatDuration,
  formatKst,
  formatPnl,
  formatPrice,
} from "@/lib/utils/format";
import { exchangeLabel, statusLabel } from "@/lib/utils/labels";

interface TradeCardProps {
  trade: Trade;
}

export function TradeCard({ trade }: TradeCardProps) {
  const isWin = Number(trade.pnl) >= 0;
  const sideLabel = trade.side === "LONG" ? "롱" : "숏";
  const sideCls =
    trade.side === "LONG" ? "text-emerald-400" : "text-rose-400";
  const asset = trade.base_asset ?? trade.symbol.replace(/USDT$/i, "");

  return (
    <article className="group relative overflow-hidden border-b border-zinc-800/80 py-5 transition hover:bg-zinc-900/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-50">
            {asset}{" "}
            <span className={sideCls}>{sideLabel}</span>
          </h2>
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-bold tracking-wide ${
              trade.status === "TP"
                ? "bg-emerald-500/15 text-emerald-400"
                : trade.status === "SL"
                  ? "bg-rose-500/15 text-rose-400"
                  : "bg-zinc-700/50 text-zinc-300"
            }`}
          >
            {statusLabel(trade.status)}
          </span>
          <span className="text-xs text-zinc-500">
            {exchangeLabel(trade.exchange)}
          </span>
        </div>

        <div className="text-right">
          <p
            className={`text-lg font-semibold tabular-nums ${
              isWin ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            순손익 {formatPnl(Number(trade.pnl))}
          </p>
          <p className="text-xs text-zinc-500">
            보유 {formatDuration(trade.duration_minutes)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums text-zinc-400">
        <span>
          진입{" "}
          <span className="text-zinc-200">
            {formatPrice(Number(trade.entry_price))}
          </span>
        </span>
        <span>
          청산{" "}
          <span className="text-zinc-200">
            {formatPrice(Number(trade.exit_price))}
          </span>
        </span>
        <span>
          수량{" "}
          <span className="text-zinc-200">{Number(trade.qty)}</span>
        </span>
        {trade.pnl_percent != null && (
          <span
            className={
              Number(trade.pnl_percent) >= 0
                ? "text-emerald-400/80"
                : "text-rose-400/80"
            }
          >
            {Number(trade.pnl_percent) >= 0 ? "+" : ""}
            {Number(trade.pnl_percent).toFixed(2)}%
          </span>
        )}
      </div>

      <div className="mt-2 text-xs text-zinc-600">
        {formatKst(trade.entry_time)} → {formatKst(trade.exit_time)} KST
      </div>

      {trade.notes && (
        <p className="mt-3 text-sm leading-relaxed text-zinc-300">
          {trade.notes}
        </p>
      )}
    </article>
  );
}
