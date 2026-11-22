-- Hyperliquid 관심 트레이더 관찰 (포지션·히스토리)
-- 이후 알림·카피 테스트의 기반 테이블

create table if not exists public.hl_traders (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  label text,
  note text,
  is_active boolean not null default true,
  account_value numeric,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hl_traders_address_unique unique (address)
);

create index if not exists hl_traders_active_idx
  on public.hl_traders (is_active, updated_at desc);

-- 현재 열린 포지션 스냅샷 (트레이더×코인×방향 1행)
create table if not exists public.hl_open_positions (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.hl_traders (id) on delete cascade,
  coin text not null,
  side text not null check (side in ('LONG', 'SHORT')),
  size numeric not null,
  entry_price numeric,
  mark_price numeric,
  unrealised_pnl numeric,
  leverage numeric,
  liquidation_px numeric,
  position_value numeric,
  raw jsonb,
  opened_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint hl_open_positions_unique unique (trader_id, coin, side)
);

create index if not exists hl_open_positions_trader_idx
  on public.hl_open_positions (trader_id);

-- 포지션 변경 히스토리 (오픈·증감·청산)
create table if not exists public.hl_position_events (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.hl_traders (id) on delete cascade,
  coin text not null,
  side text not null check (side in ('LONG', 'SHORT')),
  event_type text not null check (event_type in ('OPEN', 'INCREASE', 'DECREASE', 'CLOSE', 'FLIP')),
  size_before numeric,
  size_after numeric,
  entry_price numeric,
  mark_price numeric,
  unrealised_pnl numeric,
  note text,
  observed_at timestamptz not null default now(),
  raw jsonb
);

create index if not exists hl_position_events_trader_time_idx
  on public.hl_position_events (trader_id, observed_at desc);

create index if not exists hl_position_events_coin_time_idx
  on public.hl_position_events (coin, observed_at desc);

alter table public.hl_traders enable row level security;
alter table public.hl_open_positions enable row level security;
alter table public.hl_position_events enable row level security;

create policy "Allow public read hl_traders"
  on public.hl_traders for select using (true);

create policy "Allow public read hl_open_positions"
  on public.hl_open_positions for select using (true);

create policy "Allow public read hl_position_events"
  on public.hl_position_events for select using (true);
