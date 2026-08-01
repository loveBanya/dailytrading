"use client";

import type { ExchangeAccount, WalletOverview } from "@/lib/exchanges/wallet";
import { exchangeLabel } from "@/lib/utils/labels";
import { formatPnl, formatPrice } from "@/lib/utils/format";

interface WalletPanelProps {
  overview: WalletOverview | null;
  loading?: boolean;
  error?: string | null;
}

export function WalletPanel({ overview, loading, error }: WalletPanelProps) {
  if (loading) {
    return <p className="text-sm text-zinc-500">지갑을 불러오는 중…</p>;
  }
  if (error) {
    return <p className="text-sm text-amber-300/80">{error}</p>;
  }
  if (!overview || overview.accounts.length === 0) {
    return <p className="text-sm text-zinc-500">지갑 정보가 없습니다</p>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Box label="합계 자산" value={`$${overview.totalEquity.toFixed(2)}`} />
        <Box
          label="합계 지갑"
          value={`$${overview.totalWalletBalance.toFixed(2)}`}
        />
        <Box
          label="합계 사용가능"
          value={`$${overview.totalAvailableBalance.toFixed(2)}`}
        />
        <Box
          label="합계 미실현"
          value={formatPnl(overview.totalPerpUPL)}
          positive={overview.totalPerpUPL >= 0}
        />
      </div>

      {overview.accounts.map((account) => (
        <AccountSection key={account.exchange} account={account} />
      ))}
    </div>
  );
}

function AccountSection({ account }: { account: ExchangeAccount }) {
  const { exchange, wallet, positions, error } = account;
  return (
    <div className="rounded-md border border-zinc-800/80 bg-zinc-950/30 p-4">
      <h3 className="mb-3 text-sm font-semibold text-zinc-100">
        {exchangeLabel(exchange)}
      </h3>
      {error && <p className="mb-2 text-xs text-amber-300/80">{error}</p>}
      {wallet && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Box label="총 자산" value={`$${wallet.totalEquity.toFixed(2)}`} />
          <Box
            label="지갑 잔고"
            value={`$${wallet.totalWalletBalance.toFixed(2)}`}
          />
          <Box
            label="사용 가능"
            value={`$${wallet.totalAvailableBalance.toFixed(2)}`}
          />
          <Box
            label="미실현 손익"
            value={formatPnl(wallet.totalPerpUPL)}
            positive={wallet.totalPerpUPL >= 0}
          />
        </div>
      )}
      {wallet && wallet.coins.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {wallet.coins.slice(0, 12).map((c) => (
            <div
              key={c.coin}
              className="rounded border border-zinc-800 px-2.5 py-1.5 text-xs"
            >
              <span className="font-medium text-zinc-200">{c.coin}</span>
              <span className="ml-2 tabular-nums text-zinc-500">
                ${c.usdValue.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
      <h4 className="mb-2 text-xs font-medium text-zinc-400">
        열린 포지션{positions.length > 0 ? ` (${positions.length})` : ""}
      </h4>
      {positions.length === 0 ? (
        <p className="text-sm text-zinc-500">열린 포지션이 없습니다</p>
      ) : (
        <div className="space-y-2">
          {positions.map((p) => (
            <div
              key={`${p.exchange}-${p.symbol}-${p.side}`}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/60 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-100">
                  {p.symbol.replace(/USDT$/i, "")}
                </span>
                <span
                  className={
                    p.side === "LONG" ? "text-emerald-400" : "text-rose-400"
                  }
                >
                  {p.side === "LONG" ? "롱" : "숏"}
                </span>
                <span className="text-xs text-zinc-500">
                  {p.leverage}배 · 진입 {formatPrice(p.avgPrice)}
                </span>
              </div>
              <span
                className={`tabular-nums font-medium ${
                  p.unrealisedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatPnl(p.unrealisedPnl)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Box({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-md border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5">
      <p className="text-[11px] text-zinc-500">{label}</p>
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
