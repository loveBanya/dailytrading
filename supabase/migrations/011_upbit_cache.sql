-- 업비트 1회 동기화 캐시 (이력은 uuid 기준 append-only)

create table if not exists public.upbit_account_snapshots (
  id uuid primary key default gen_random_uuid(),
  synced_at timestamptz not null default now(),
  accounts jsonb not null default '[]'::jsonb,
  note text
);

create index if not exists upbit_account_snapshots_synced_idx
  on public.upbit_account_snapshots (synced_at desc);

create table if not exists public.upbit_orders (
  uuid text primary key,
  market text not null,
  side text not null,
  ord_type text,
  state text,
  price numeric,
  volume numeric,
  executed_volume numeric,
  paid_fee numeric,
  created_at timestamptz,
  done_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now()
);

create index if not exists upbit_orders_done_idx
  on public.upbit_orders (done_at desc nulls last);

create index if not exists upbit_orders_market_idx
  on public.upbit_orders (market);

create table if not exists public.upbit_transfers (
  uuid text primary key,
  kind text not null check (kind in ('deposit', 'withdraw')),
  currency text not null,
  amount numeric,
  fee numeric,
  state text,
  created_at timestamptz,
  done_at timestamptz,
  txid text,
  raw jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now()
);

create index if not exists upbit_transfers_done_idx
  on public.upbit_transfers (done_at desc nulls last);

alter table public.upbit_account_snapshots enable row level security;
alter table public.upbit_orders enable row level security;
alter table public.upbit_transfers enable row level security;

drop policy if exists "Allow public read upbit_account_snapshots" on public.upbit_account_snapshots;
create policy "Allow public read upbit_account_snapshots"
  on public.upbit_account_snapshots for select using (true);
drop policy if exists "Allow public write upbit_account_snapshots" on public.upbit_account_snapshots;
create policy "Allow public write upbit_account_snapshots"
  on public.upbit_account_snapshots for all using (true) with check (true);

drop policy if exists "Allow public read upbit_orders" on public.upbit_orders;
create policy "Allow public read upbit_orders"
  on public.upbit_orders for select using (true);
drop policy if exists "Allow public write upbit_orders" on public.upbit_orders;
create policy "Allow public write upbit_orders"
  on public.upbit_orders for all using (true) with check (true);

drop policy if exists "Allow public read upbit_transfers" on public.upbit_transfers;
create policy "Allow public read upbit_transfers"
  on public.upbit_transfers for select using (true);
drop policy if exists "Allow public write upbit_transfers" on public.upbit_transfers;
create policy "Allow public write upbit_transfers"
  on public.upbit_transfers for all using (true) with check (true);
