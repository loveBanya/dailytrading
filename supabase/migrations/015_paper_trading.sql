-- 모의투자: 가상 계좌 / 전략 / 포지션 / 체결 / 에쿼티 / 틱 로그

create table if not exists public.paper_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null default '기본 계좌',
  starting_equity numeric not null default 10000
    check (starting_equity > 0),
  cash numeric not null default 10000,
  equity numeric not null default 10000,
  currency text not null default 'USDT',
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  last_tick_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.paper_accounts enable row level security;
drop policy if exists "Allow public all paper_accounts" on public.paper_accounts;
create policy "Allow public all paper_accounts"
  on public.paper_accounts for all using (true) with check (true);

create table if not exists public.paper_strategies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.paper_accounts (id) on delete cascade,
  name text not null,
  mode text not null check (mode in ('indicator', 'copy')),
  enabled boolean not null default true,
  -- indicator: { exchange, symbol, interval, rule, params, risk }
  -- copy: { traderId, scale, maxNotional, coins? }
  config jsonb not null default '{}'::jsonb,
  note text,
  last_run_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists paper_strategies_account_idx
  on public.paper_strategies (account_id, enabled);

alter table public.paper_strategies enable row level security;
drop policy if exists "Allow public all paper_strategies" on public.paper_strategies;
create policy "Allow public all paper_strategies"
  on public.paper_strategies for all using (true) with check (true);

create table if not exists public.paper_positions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.paper_accounts (id) on delete cascade,
  strategy_id uuid references public.paper_strategies (id) on delete set null,
  exchange text not null default 'binance',
  symbol text not null,
  side text not null check (side in ('LONG', 'SHORT')),
  qty numeric not null check (qty > 0),
  entry_price numeric not null,
  mark_price numeric,
  unrealised_pnl numeric default 0,
  notional numeric,
  leverage numeric not null default 1,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  close_price numeric,
  realised_pnl numeric,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists paper_positions_open_idx
  on public.paper_positions (account_id, status, opened_at desc);
create index if not exists paper_positions_strategy_idx
  on public.paper_positions (strategy_id, status);

alter table public.paper_positions enable row level security;
drop policy if exists "Allow public all paper_positions" on public.paper_positions;
create policy "Allow public all paper_positions"
  on public.paper_positions for all using (true) with check (true);

create table if not exists public.paper_fills (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.paper_accounts (id) on delete cascade,
  strategy_id uuid references public.paper_strategies (id) on delete set null,
  position_id uuid references public.paper_positions (id) on delete set null,
  exchange text not null default 'binance',
  symbol text not null,
  side text not null check (side in ('LONG', 'SHORT')),
  action text not null check (action in ('OPEN', 'CLOSE', 'INCREASE', 'DECREASE')),
  qty numeric not null,
  price numeric not null,
  notional numeric,
  fee numeric not null default 0,
  realised_pnl numeric,
  reason text,
  observed_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists paper_fills_account_idx
  on public.paper_fills (account_id, observed_at desc);

alter table public.paper_fills enable row level security;
drop policy if exists "Allow public all paper_fills" on public.paper_fills;
create policy "Allow public all paper_fills"
  on public.paper_fills for all using (true) with check (true);

create table if not exists public.paper_equity_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.paper_accounts (id) on delete cascade,
  equity numeric not null,
  cash numeric not null,
  open_pnl numeric not null default 0,
  taken_at timestamptz not null default now()
);

create index if not exists paper_equity_account_idx
  on public.paper_equity_snapshots (account_id, taken_at desc);

alter table public.paper_equity_snapshots enable row level security;
drop policy if exists "Allow public all paper_equity_snapshots" on public.paper_equity_snapshots;
create policy "Allow public all paper_equity_snapshots"
  on public.paper_equity_snapshots for all using (true) with check (true);

create table if not exists public.paper_tick_logs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean not null default true,
  strategies_run int not null default 0,
  fills_created int not null default 0,
  message text,
  detail jsonb not null default '{}'::jsonb
);

alter table public.paper_tick_logs enable row level security;
drop policy if exists "Allow public all paper_tick_logs" on public.paper_tick_logs;
create policy "Allow public all paper_tick_logs"
  on public.paper_tick_logs for all using (true) with check (true);
