"use client";

import type { DisplayCurrency } from "@/lib/display-money";

export function CurrencyToggle({
  value,
  onChange,
}: {
  value: DisplayCurrency;
  onChange: (next: DisplayCurrency) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-zinc-500">통화</span>
      {(
        [
          ["krw", "한화(원)"],
          ["usdt", "USDT"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
            value === id
              ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
              : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
