-- 관심 트레이더 과거 성과(일/주/월/올타임 PnL·ROI)
alter table public.hl_traders
  add column if not exists pnl_day numeric,
  add column if not exists roi_day numeric,
  add column if not exists pnl_week numeric,
  add column if not exists roi_week numeric,
  add column if not exists pnl_month numeric,
  add column if not exists roi_month numeric,
  add column if not exists pnl_all_time numeric,
  add column if not exists roi_all_time numeric,
  add column if not exists volume_month numeric,
  add column if not exists perf_synced_at timestamptz;

comment on column public.hl_traders.pnl_day is 'HL 리더보드/포트폴리오 기준 일 PnL (USD)';
comment on column public.hl_traders.roi_day is '일 ROI (소수, 0.1 = 10%)';
comment on column public.hl_traders.pnl_all_time is '올타임 누적 PnL (USD)';
