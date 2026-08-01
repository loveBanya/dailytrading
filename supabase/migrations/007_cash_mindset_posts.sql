-- 현금 입출금 / 매매 마인드 / 저널 포스팅

-- 1) 현금 입출금 (업비트 등 국내 경유 KRW)
create table if not exists public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  title text not null,
  deposit numeric not null default 0,
  withdrawal numeric not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cash_entries_date_idx
  on public.cash_entries (entry_date desc);

drop trigger if exists cash_entries_updated_at on public.cash_entries;
create trigger cash_entries_updated_at
  before update on public.cash_entries
  for each row execute function public.set_updated_at();

alter table public.cash_entries enable row level security;

drop policy if exists "Allow public read cash_entries" on public.cash_entries;
create policy "Allow public read cash_entries"
  on public.cash_entries for select using (true);

drop policy if exists "Allow public write cash_entries" on public.cash_entries;
create policy "Allow public write cash_entries"
  on public.cash_entries for all using (true) with check (true);

-- 시드 (이미 데이터가 있으면 건너뜀)
insert into public.cash_entries (entry_date, title, deposit, withdrawal, note)
select * from (values
  ('2023-01-01'::date, '23년 기존 입출금', 950000::numeric, 616486::numeric, '크아악'),
  ('2024-01-01'::date, '24년 기존 입출금', 200000::numeric, 239308::numeric, null),
  ('2025-01-01'::date, '25년 기존 입출금', 4959008::numeric, 2101371::numeric, null),
  ('2026-03-02'::date, '26년 기존 입출금', 1981221::numeric, 1100000::numeric, '기입금 내용이 있으니까 뭐'),
  ('2026-03-03'::date, '입금', 400000::numeric, 0::numeric, null),
  ('2026-03-11'::date, '출금', 0::numeric, 445922::numeric, '형 빚'),
  ('2026-04-07'::date, '입금', 200000::numeric, 0::numeric, null),
  ('2026-04-08'::date, '입금', 100000::numeric, 0::numeric, '여기까지 청산'),
  ('2026-04-14'::date, '입금', 400000::numeric, 0::numeric, null),
  ('2026-04-17'::date, '입금', 300000::numeric, 0::numeric, '여기까지 운용중'),
  ('2026-04-18'::date, '입금', 100000::numeric, 0::numeric, null),
  ('2026-04-22'::date, '입금', 100000::numeric, 0::numeric, null),
  ('2026-04-27'::date, '입금', 400000::numeric, 0::numeric, null),
  ('2026-05-11'::date, '입금', 300000::numeric, 0::numeric, null),
  ('2026-05-24'::date, '입금', 200000::numeric, 0::numeric, null),
  ('2026-05-28'::date, '입금', 700000::numeric, 0::numeric, '복구전까지'),
  ('2026-06-08'::date, '입금', 500000::numeric, 0::numeric, '추가입금 금지하겠습니다'),
  ('2026-06-16'::date, '출금', 0::numeric, 300000::numeric, '메이플 ㄷㄷ'),
  ('2026-07-23'::date, '입금', 450000::numeric, 0::numeric, 'ㄱ-'),
  ('2026-07-26'::date, '입금', 800000::numeric, 0::numeric, null)
) as v(entry_date, title, deposit, withdrawal, note)
where not exists (select 1 from public.cash_entries limit 1);

-- 2) 매매 마인드 (단일 문서)
create table if not exists public.mindset_docs (
  id text primary key default 'main',
  body text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.mindset_docs (id, body)
values ('main', '')
on conflict (id) do nothing;

alter table public.mindset_docs enable row level security;

drop policy if exists "Allow public read mindset_docs" on public.mindset_docs;
create policy "Allow public read mindset_docs"
  on public.mindset_docs for select using (true);

drop policy if exists "Allow public write mindset_docs" on public.mindset_docs;
create policy "Allow public write mindset_docs"
  on public.mindset_docs for all using (true) with check (true);

-- 3) 저널 포스팅
create table if not exists public.journal_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  images text[] not null default '{}',
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists journal_posts_created_idx
  on public.journal_posts (created_at desc);
create index if not exists journal_posts_fav_idx
  on public.journal_posts (is_favorite, created_at desc);

drop trigger if exists journal_posts_updated_at on public.journal_posts;
create trigger journal_posts_updated_at
  before update on public.journal_posts
  for each row execute function public.set_updated_at();

alter table public.journal_posts enable row level security;

drop policy if exists "Allow public read journal_posts" on public.journal_posts;
create policy "Allow public read journal_posts"
  on public.journal_posts for select using (true);

drop policy if exists "Allow public write journal_posts" on public.journal_posts;
create policy "Allow public write journal_posts"
  on public.journal_posts for all using (true) with check (true);

-- 4) 포스팅 댓글
create table if not exists public.journal_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.journal_posts (id) on delete cascade,
  parent_id uuid references public.journal_post_comments (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists journal_post_comments_post_idx
  on public.journal_post_comments (post_id, created_at);

drop trigger if exists journal_post_comments_updated_at on public.journal_post_comments;
create trigger journal_post_comments_updated_at
  before update on public.journal_post_comments
  for each row execute function public.set_updated_at();

alter table public.journal_post_comments enable row level security;

drop policy if exists "Allow public read journal_post_comments" on public.journal_post_comments;
create policy "Allow public read journal_post_comments"
  on public.journal_post_comments for select using (true);

drop policy if exists "Allow public write journal_post_comments" on public.journal_post_comments;
create policy "Allow public write journal_post_comments"
  on public.journal_post_comments for all using (true) with check (true);
