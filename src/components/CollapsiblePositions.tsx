"use client";

import { useState } from "react";
import type {
  ExchangeAccount,
  OpenPosition,
  WalletOverview,
} from "@/lib/exchanges/wallet";
import { exchangeLabel } from "@/lib/utils/labels";
import { formatPnl, formatPrice } from "@/lib/utils/format";
import { LivePositionCard } from "./LivePositionCard";

interface CollapsiblePositionsProps {
  overview: WalletOverview | null;
  /** @deprecated overview 사용 */
  wallet?: WalletOverview["wallet"];
  positions?: OpenPosition[];
  loading?: boolean;
  error?: string | null;
  defaultOpen?: boolean;
}

/** 실시간 포지션 — 거래소별 자산, 기본 접힘 */
export function CollapsiblePositions({
  overview,
  wallet,
  positions,
  loading,
  error,
  defaultOpen = false,
}: CollapsiblePositionsProps) {
  const [open, setOpen] = useState(defaultOpen);

  const accounts = overview?.accounts ?? [];
  const allPositions = overview?.positions ?? positions ?? [];
  const equity = overview?.totalEquity ?? wallet?.totalEquity ?? 0;
  const upl = overview?.totalPerpUPL ?? wallet?.totalPerpUPL ?? 0;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-200">
            실시간 자산
            <span className="ml-2 text-zinc-500">
              {accounts.length > 0
                ? `${accounts.length}개 거래소`
                : "연결 없음"}
              {allPositions.length > 0 ? ` · 포지션 ${allPositions.length}` : ""}
            </span>
          </p>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            합계 ${equity.toFixed(2)}
            {" · "}
            미실현{" "}
            <span className={upl >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {formatPnl(upl)}
            </span>
          </p>
        </div>
        <span className="shrink-0 text-xs text-zinc-500">
          {open ? "접기 ▲" : "펼치기 ▼"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-zinc-800 px-4 py-3">
          {loading && <p className="text-sm text-zinc-500">불러오는 중…</p>}
          {error && <p className="text-sm text-amber-300/80">{error}</p>}

          {!loading && accounts.length === 0 && !error && (
            <p className="text-sm text-zinc-500">
              연결된 거래소 API 키가 없습니다
            </p>
          )}

          {accounts.map((account) => (
            <ExchangeBlock key={account.exchange} account={account} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExchangeBlock({ account }: { account: ExchangeAccount }) {
  const { exchange, wallet, positions, error } = account;
  const equity = wallet?.totalEquity ?? 0;
  const upl = wallet?.totalPerpUPL ?? 0;

  return (
    <div className="rounded-md border border-zinc-800/80 bg-zinc-950/40 p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">
          {exchangeLabel(exchange)}
        </h3>
        {wallet && (
          <p className="text-xs text-zinc-500">
            자산{" "}
            <span className="tabular-nums text-zinc-200">
              ${equity.toFixed(2)}
            </span>
            {" · "}
            미실현{" "}
            <span
              className={`tabular-nums ${
                upl >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatPnl(upl)}
            </span>
          </p>
        )}
      </div>

      {error && (
        <p className="mb-2 text-xs text-amber-300/80">{error}</p>
      )}

      {wallet && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Mini label="총 자산" value={`$${equity.toFixed(2)}`} />
          <Mini
            label="지갑"
            value={`$${wallet.totalWalletBalance.toFixed(2)}`}
          />
          <Mini
            label="사용가능"
            value={`$${wallet.totalAvailableBalance.toFixed(2)}`}
          />
          <Mini label="미실현" value={formatPnl(upl)} positive={upl >= 0} />
        </div>
      )}

      {wallet && wallet.coins.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {wallet.coins.slice(0, 8).map((c) => (
            <span
              key={c.coin}
              className="rounded border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400"
            >
              <span className="text-zinc-200">{c.coin}</span> $
              {c.usdValue.toFixed(2)}
            </span>
          ))}
        </div>
      )}

      {positions.length === 0 ? (
        <p className="text-xs text-zinc-600">열린 포지션 없음</p>
      ) : (
        <div className="space-y-2">
          {positions.map((p) => (
            <CompactPosition
              key={`${p.exchange}-${p.symbol}-${p.side}`}
              position={p}
            />
          ))}
          <details className="group">
            <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
              차트 자세히 보기
            </summary>
            <div className="mt-3 space-y-4">
              {positions.map((p) => (
                <LivePositionCard
                  key={`chart-${p.exchange}-${p.symbol}-${p.side}`}
                  position={p}
                />
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function CompactPosition({ position }: { position: OpenPosition }) {
  const asset = position.symbol.replace(/USDT$/i, "");
  const isWin = position.unrealisedPnl >= 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-800/60 bg-zinc-900/50 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-zinc-100">{asset}</span>
        <span
          className={
            position.side === "LONG" ? "text-emerald-400" : "text-rose-400"
          }
        >
          {position.side === "LONG" ? "롱" : "숏"}
        </span>
        <span className="text-xs text-zinc-500">
          {position.leverage}배 · 진입 {formatPrice(position.avgPrice)}
        </span>
        {position.takeProfit != null && (
          <span className="text-xs text-rose-400/80">
            TP {formatPrice(position.takeProfit)}
          </span>
        )}
        {position.stopLoss != null && (
          <span className="text-xs text-blue-400/80">
            SL {formatPrice(position.stopLoss)}
          </span>
        )}
      </div>
      <span
        className={`tabular-nums font-medium ${
          isWin ? "text-emerald-400" : "text-rose-400"
        }`}
      >
        {formatPnl(position.unrealisedPnl)}
      </span>
    </div>
  );
}

function Mini({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded border border-zinc-800/60 px-2 py-1.5">
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p
        className={`text-sm font-semibold tabular-nums ${
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
