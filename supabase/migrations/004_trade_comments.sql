-- 매매별 댓글 / 답글
create table if not exists public.trade_comments (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades (id) on delete cascade,
  parent_id uuid references public.trade_comments (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trade_comments_trade_idx
  on public.trade_comments (trade_id, created_at);

create index if not exists trade_comments_parent_idx
  on public.trade_comments (parent_id);

alter table public.trade_comments enable row level security;

drop policy if exists "Allow public read trade_comments" on public.trade_comments;
create policy "Allow public read trade_comments"
  on public.trade_comments for select
  using (true);
