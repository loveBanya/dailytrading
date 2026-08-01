-- 원칙매매 / 뇌동 구분
alter table public.trades
  add column if not exists trade_style text
  check (trade_style is null or trade_style in ('원칙', '뇌동'));
