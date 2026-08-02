-- 매매 기록 차트 캔들 캐시 (청산 후 불변 → 거래소 재호출 최소화)

create table if not exists public.trade_chart_candles (
  trade_id uuid primary key references public.trades (id) on delete cascade,
  symbol text not null,
  interval text not null,
  start_ms bigint not null,
  end_ms bigint not null,
  candles jsonb not null default '[]'::jsonb,
  source text,
  fetched_at timestamptz not null default now()
);

create index if not exists trade_chart_candles_symbol_idx
  on public.trade_chart_candles (symbol);

alter table public.trade_chart_candles enable row level security;

drop policy if exists "Allow public read trade_chart_candles" on public.trade_chart_candles;
create policy "Allow public read trade_chart_candles"
  on public.trade_chart_candles for select using (true);

drop policy if exists "Allow public write trade_chart_candles" on public.trade_chart_candles;
create policy "Allow public write trade_chart_candles"
  on public.trade_chart_candles for all using (true) with check (true);
