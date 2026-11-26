-- 모의투자 전략 모드: Coinglass 스타일 급상승/OI 신호(movers) 추가

alter table public.paper_strategies
  drop constraint if exists paper_strategies_mode_check;

alter table public.paper_strategies
  add constraint paper_strategies_mode_check
  check (mode in ('indicator', 'copy', 'movers'));
