-- 매매일지 테이블
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),

  -- 거래소 / 식별
  exchange text not null check (exchange in ('bybit', 'binance')),
  external_id text not null,          -- 거래소 고유 ID (중복 방지)
  symbol text not null,               -- 예: ICPUSDT
  base_asset text,                    -- 예: ICP

  -- 포지션
  side text not null check (side in ('LONG', 'SHORT')),
  qty numeric not null,
  entry_price numeric not null,
  exit_price numeric not null,
  leverage numeric,

  -- 손익
  pnl numeric not null default 0,     -- 실현 손익 (USDT)
  pnl_percent numeric,                -- 수익률 (%)
  fee numeric default 0,

  -- 결과 분류
  status text not null default 'CLOSED'
    check (status in ('TP', 'SL', 'CLOSED', 'LIQUIDATED')),

  -- 시간
  entry_time timestamptz not null,
  exit_time timestamptz not null,
  duration_minutes integer,           -- 보유 시간(분)

  -- 메모 / 스크린샷
  notes text,
  screenshot_url text,
  tags text[] default '{}',

  -- 메타
  raw jsonb,                          -- 원본 API 응답
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (exchange, external_id)
);

create index if not exists trades_exit_time_idx on public.trades (exit_time desc);
create index if not exists trades_symbol_idx on public.trades (symbol);
create index if not exists trades_exchange_idx on public.trades (exchange);

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trades_updated_at on public.trades;
create trigger trades_updated_at
  before update on public.trades
  for each row execute function public.set_updated_at();

-- 동기화 로그
create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  exchange text not null,
  status text not null check (status in ('success', 'error')),
  fetched_count integer default 0,
  inserted_count integer default 0,
  message text,
  created_at timestamptz not null default now()
);

-- RLS (단일 사용자용: service role로 서버에서만 접근 권장)
alter table public.trades enable row level security;
alter table public.sync_logs enable row level security;

-- anon 키로 읽기만 허용 (원하면 나중에 인증 추가)
create policy "Allow public read trades"
  on public.trades for select
  using (true);

create policy "Allow public read sync_logs"
  on public.sync_logs for select
  using (true);
