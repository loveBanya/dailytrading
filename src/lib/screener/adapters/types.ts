import type { OhlcvCandle, ScreenerExchange, Timeframe, UniverseTicker } from "../types";

export interface ExchangePublicAdapter {
  exchange: ScreenerExchange;
  listUniverse(): Promise<UniverseTicker[]>;
  fetchKlines(
    symbol: string,
    timeframe: Timeframe,
    limit?: number
  ): Promise<OhlcvCandle[]>;
  fetchFundingRate(symbol: string): Promise<number | null>;
  fetchOpenInterestChangePct(symbol: string): Promise<number | null>;
}
