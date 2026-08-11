-- USDT 외부 자본 흐름 (업비트→테더 입금 등)

create table if not exists public.asset_flows (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  direction text not null check (direction in ('in', 'out')),
  amount_usdt numeric not null check (amount_usdt > 0),
  source text not null default 'upbit',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists asset_flows_date_idx
  on public.asset_flows (entry_date desc);

drop trigger if exists asset_flows_updated_at on public.asset_flows;
create trigger asset_flows_updated_at
  before update on public.asset_flows
  for each row execute function public.set_updated_at();

alter table public.asset_flows enable row level security;

drop policy if exists "Allow public read asset_flows" on public.asset_flows;
create policy "Allow public read asset_flows"
  on public.asset_flows for select using (true);

drop policy if exists "Allow public write asset_flows" on public.asset_flows;
create policy "Allow public write asset_flows"
  on public.asset_flows for all using (true) with check (true);
