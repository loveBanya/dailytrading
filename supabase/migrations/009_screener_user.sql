-- 스크리너 사용자 기능: 제외 / 메모 / 즐찾 / 가상투자 추적

create table if not exists public.screener_exclusions (
  id uuid primary key default gen_random_uuid(),
  exchange text not null check (exchange in ('binance', 'bybit')),
  symbol text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (exchange, symbol)
);

create index if not exists screener_exclusions_symbol_idx
  on public.screener_exclusions (symbol);

alter table public.screener_exclusions enable row level security;

drop policy if exists "Allow public all screener_exclusions" on public.screener_exclusions;
create policy "Allow public all screener_exclusions"
  on public.screener_exclusions for all using (true) with check (true);

-- 메모: 작성 시각 + 당시 코인 상태 스냅샷
create table if not exists public.screener_coin_notes (
  id uuid primary key default gen_random_uuid(),
  exchange text not null check (exchange in ('binance', 'bybit')),
  symbol text not null,
  body text not null,
  noted_at timestamptz not null default now(),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists screener_coin_notes_symbol_idx
  on public.screener_coin_notes (exchange, symbol, noted_at desc);

alter table public.screener_coin_notes enable row level security;

drop policy if exists "Allow public all screener_coin_notes" on public.screener_coin_notes;
create policy "Allow public all screener_coin_notes"
  on public.screener_coin_notes for all using (true) with check (true);

-- 즐겨찾기: 등록 시각 + 당시 코인 상태 스냅샷
create table if not exists public.screener_coin_favorites (
  id uuid primary key default gen_random_uuid(),
  exchange text not null check (exchange in ('binance', 'bybit')),
  symbol text not null,
  favorited_at timestamptz not null default now(),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (exchange, symbol)
);

create index if not exists screener_coin_favorites_at_idx
  on public.screener_coin_favorites (favorited_at desc);

alter table public.screener_coin_favorites enable row level security;

drop policy if exists "Allow public all screener_coin_favorites" on public.screener_coin_favorites;
create policy "Allow public all screener_coin_favorites"
  on public.screener_coin_favorites for all using (true) with check (true);

-- 가상 투자 추적: 당시 진입 가정 → 다음 추적 시 수익률
create table if not exists public.screener_paper_tracks (
  id uuid primary key default gen_random_uuid(),
  exchange text not null check (exchange in ('binance', 'bybit')),
  symbol text not null,
  direction text not null
    check (direction in ('LONG', 'SHORT', 'WAIT', 'LONG_CAUTION', 'SHORT_CAUTION')),
  track_type text not null default 'manual'
    check (track_type in ('manual', 'scan', 'macd', 'favorite')),
  entry_price numeric not null,
  entry_at timestamptz not null default now(),
  entry_snapshot jsonb not null default '{}'::jsonb,
  last_price numeric,
  last_at timestamptz,
  ret_pct numeric,
  mfe_pct numeric,
  mae_pct numeric,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists screener_paper_tracks_open_idx
  on public.screener_paper_tracks (status, entry_at desc);
create index if not exists screener_paper_tracks_type_idx
  on public.screener_paper_tracks (track_type, entry_at desc);
create index if not exists screener_paper_tracks_symbol_idx
  on public.screener_paper_tracks (exchange, symbol);

alter table public.screener_paper_tracks enable row level security;

drop policy if exists "Allow public all screener_paper_tracks" on public.screener_paper_tracks;
create policy "Allow public all screener_paper_tracks"
  on public.screener_paper_tracks for all using (true) with check (true);
