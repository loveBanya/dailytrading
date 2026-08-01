-- 코인 스크리너 신호 / 성과 추적

create table if not exists public.screener_signals (
  id uuid primary key default gen_random_uuid(),
  exchange text not null check (exchange in ('binance', 'bybit')),
  symbol text not null,
  direction text not null
    check (direction in ('LONG', 'SHORT', 'WAIT', 'LONG_CAUTION', 'SHORT_CAUTION')),
  timeframe text not null,
  candle_close_time bigint not null,
  strongest_strategy text,
  strategy_scores jsonb not null default '{}'::jsonb,
  score_total numeric not null default 0,
  score_long numeric not null default 0,
  score_short numeric not null default 0,
  stars integer not null default 1 check (stars between 1 and 5),
  price numeric not null,
  vol_mult numeric,
  turnover_mult numeric,
  turnover_24h numeric,
  rsi numeric,
  macd_state text,
  ema_state text,
  bb_state text,
  atr numeric,
  oi_change_pct numeric,
  funding_rate numeric,
  entry_price numeric,
  stop_price numeric,
  tp1 numeric,
  tp2 numeric,
  rr1 numeric,
  rr2 numeric,
  reasons text[] not null default '{}',
  risks text[] not null default '{}',
  signal_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (exchange, symbol, strongest_strategy, candle_close_time, direction)
);

create index if not exists screener_signals_at_idx
  on public.screener_signals (signal_at desc);
create index if not exists screener_signals_score_idx
  on public.screener_signals (score_total desc);
create index if not exists screener_signals_symbol_idx
  on public.screener_signals (exchange, symbol);

alter table public.screener_signals enable row level security;

drop policy if exists "Allow public read screener_signals" on public.screener_signals;
create policy "Allow public read screener_signals"
  on public.screener_signals for select using (true);

drop policy if exists "Allow public write screener_signals" on public.screener_signals;
create policy "Allow public write screener_signals"
  on public.screener_signals for all using (true) with check (true);

create table if not exists public.screener_signal_outcomes (
  signal_id uuid primary key references public.screener_signals (id) on delete cascade,
  price_5m numeric,
  price_15m numeric,
  price_30m numeric,
  price_1h numeric,
  price_4h numeric,
  price_24h numeric,
  ret_5m numeric,
  ret_15m numeric,
  ret_30m numeric,
  ret_1h numeric,
  ret_4h numeric,
  ret_24h numeric,
  mfe numeric,
  mae numeric,
  hit_stop boolean,
  hit_tp1 boolean,
  hit_tp2 boolean,
  stopped_before_tp boolean,
  updated_at timestamptz not null default now()
);

alter table public.screener_signal_outcomes enable row level security;

drop policy if exists "Allow public read screener_signal_outcomes" on public.screener_signal_outcomes;
create policy "Allow public read screener_signal_outcomes"
  on public.screener_signal_outcomes for select using (true);

drop policy if exists "Allow public write screener_signal_outcomes" on public.screener_signal_outcomes;
create policy "Allow public write screener_signal_outcomes"
  on public.screener_signal_outcomes for all using (true) with check (true);
