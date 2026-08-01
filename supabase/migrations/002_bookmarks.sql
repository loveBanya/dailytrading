-- 사이트 북마크
create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  category text not null default '일반',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists bookmarks_sort_idx on public.bookmarks (sort_order, created_at);

alter table public.bookmarks enable row level security;

create policy "Allow public read bookmarks"
  on public.bookmarks for select
  using (true);

-- 서버(service role)가 쓰므로 insert/update/delete는 RLS로 anon 차단 유지

-- 기본 북마크 시드 (없을 때만)
insert into public.bookmarks (title, url, category, sort_order)
select * from (values
  ('트레이딩뷰', 'https://www.tradingview.com/chart/', '차트', 10),
  ('바이비트', 'https://www.bybit.com/', '거래소', 20),
  ('코인글래스', 'https://www.coinglass.com/', '데이터', 30),
  ('코인마켓캡', 'https://coinmarketcap.com/', '데이터', 40),
  ('공포탐욕지수', 'https://alternative.me/crypto/fear-and-greed-index/', '심리', 50),
  ('바이낸스', 'https://www.binance.com/', '거래소', 60)
) as v(title, url, category, sort_order)
where not exists (select 1 from public.bookmarks limit 1);
