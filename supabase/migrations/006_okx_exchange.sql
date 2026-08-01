-- exchange 에 okx 추가
alter table public.trades drop constraint if exists trades_exchange_check;
alter table public.trades
  add constraint trades_exchange_check
  check (exchange in ('bybit', 'binance', 'okx'));
