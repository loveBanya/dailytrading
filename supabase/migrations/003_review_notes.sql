-- 오답노트 플래그 (없으면 추가)
alter table public.trades
  add column if not exists is_review boolean not null default false;

create index if not exists trades_is_review_idx
  on public.trades (is_review)
  where is_review = true;
