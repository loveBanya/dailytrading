import { bybitPrivateGet } from "./bybit-client";
import { binanceGet } from "./binance";
import { okxInstToSymbol, okxPrivateGet } from "./okx";
import type { Exchange } from "./types";

export interface WalletCoin {
  coin: string;
  equity: number;
  walletBalance: number;
  availableToWithdraw: number;
  unrealisedPnl: number;
  usdValue: number;
}

export interface WalletSummary {
  exchange: Exchange;
  totalEquity: number;
  totalWalletBalance: number;
  totalAvailableBalance: number;
  totalPerpUPL: number;
  accountType: string;
  coins: WalletCoin[];
}

export interface OpenPosition {
  exchange: Exchange;
  symbol: string;
  side: "LONG" | "SHORT";
  size: number;
  avgPrice: number;
  markPrice: number;
  unrealisedPnl: number;
  leverage: number;
  liqPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
}

export interface ExchangeAccount {
  exchange: Exchange;
  wallet: WalletSummary | null;
  positions: OpenPosition[];
  error?: string;
}

export interface WalletOverview {
  accounts: ExchangeAccount[];
  /** 호환용 합산 */
  wallet: WalletSummary | null;
  positions: OpenPosition[];
  totalEquity: number;
  totalWalletBalance: number;
  totalAvailableBalance: number;
  totalPerpUPL: number;
}

interface BybitWalletBalanceResult {
  list?: Array<{
    accountType?: string;
    totalEquity?: string;
    totalWalletBalance?: string;
    totalAvailableBalance?: string;
    totalPerpUPL?: string;
    coin?: Array<{
      coin: string;
      equity?: string;
      walletBalance?: string;
      availableToWithdraw?: string;
      unrealisedPnl?: string;
      usdValue?: string;
    }>;
  }>;
}

interface BybitPositionListResult {
  list?: Array<{
    symbol: string;
    side: "Buy" | "Sell" | "None";
    size: string;
    avgPrice: string;
    markPrice: string;
    unrealisedPnl: string;
    leverage: string;
    liqPrice: string;
    takeProfit: string;
    stopLoss: string;
  }>;
}

interface BinanceAccount {
  totalWalletBalance?: string;
  totalUnrealizedProfit?: string;
  availableBalance?: string;
  totalMarginBalance?: string;
  assets?: Array<{
    asset: string;
    walletBalance?: string;
    availableBalance?: string;
    unrealizedProfit?: string;
    marginBalance?: string;
  }>;
}

interface BinancePositionRisk {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  leverage: string;
  liquidationPrice: string;
  positionSide: "BOTH" | "LONG" | "SHORT";
}

interface OkxBalanceRow {
  totalEq?: string;
  isoEq?: string;
  adjEq?: string;
  details?: Array<{
    ccy: string;
    eq?: string;
    cashBal?: string;
    availBal?: string;
    upl?: string;
    eqUsd?: string;
  }>;
}

interface OkxPositionRow {
  instId: string;
  posSide?: string;
  pos?: string;
  avgPx?: string;
  markPx?: string;
  upl?: string;
  lever?: string;
  liqPx?: string;
  mgnMode?: string;
}

function emptyWallet(exchange: Exchange, accountType: string): WalletSummary {
  return {
    exchange,
    totalEquity: 0,
    totalWalletBalance: 0,
    totalAvailableBalance: 0,
    totalPerpUPL: 0,
    accountType,
    coins: [],
  };
}

export async function fetchBybitWallet(): Promise<WalletSummary> {
  const result = await bybitPrivateGet<BybitWalletBalanceResult>(
    "/v5/account/wallet-balance",
    { accountType: "UNIFIED" }
  );

  const account = result.list?.[0];
  if (!account) return emptyWallet("bybit", "UNIFIED");

  const coins = (account.coin ?? [])
    .map((c) => ({
      coin: c.coin,
      equity: Number(c.equity ?? 0),
      walletBalance: Number(c.walletBalance ?? 0),
      availableToWithdraw: Number(c.availableToWithdraw ?? 0),
      unrealisedPnl: Number(c.unrealisedPnl ?? 0),
      usdValue: Number(c.usdValue ?? 0),
    }))
    .filter((c) => c.usdValue > 0.01 || Math.abs(c.walletBalance) > 0)
    .sort((a, b) => b.usdValue - a.usdValue);

  return {
    exchange: "bybit",
    totalEquity: Number(account.totalEquity ?? 0),
    totalWalletBalance: Number(account.totalWalletBalance ?? 0),
    totalAvailableBalance: Number(account.totalAvailableBalance ?? 0),
    totalPerpUPL: Number(account.totalPerpUPL ?? 0),
    accountType: account.accountType ?? "UNIFIED",
    coins,
  };
}

export async function fetchBybitOpenPositions(): Promise<OpenPosition[]> {
  const result = await bybitPrivateGet<BybitPositionListResult>(
    "/v5/position/list",
    { category: "linear", settleCoin: "USDT" }
  );

  return (result.list ?? [])
    .filter((p) => Number(p.size) > 0)
    .map((p) => ({
      exchange: "bybit" as const,
      symbol: p.symbol,
      side: (p.side === "Buy" ? "LONG" : "SHORT") as "LONG" | "SHORT",
      size: Number(p.size),
      avgPrice: Number(p.avgPrice),
      markPrice: Number(p.markPrice),
      unrealisedPnl: Number(p.unrealisedPnl),
      leverage: Number(p.leverage),
      liqPrice: p.liqPrice && Number(p.liqPrice) > 0 ? Number(p.liqPrice) : null,
      takeProfit:
        p.takeProfit && Number(p.takeProfit) > 0
          ? Number(p.takeProfit)
          : null,
      stopLoss:
        p.stopLoss && Number(p.stopLoss) > 0 ? Number(p.stopLoss) : null,
    }));
}

export async function fetchBinanceWallet(): Promise<WalletSummary> {
  const account = await binanceGet<BinanceAccount>("/fapi/v2/account");
  const coins = (account.assets ?? [])
    .map((a) => ({
      coin: a.asset,
      equity: Number(a.marginBalance ?? a.walletBalance ?? 0),
      walletBalance: Number(a.walletBalance ?? 0),
      availableToWithdraw: Number(a.availableBalance ?? 0),
      unrealisedPnl: Number(a.unrealizedProfit ?? 0),
      usdValue: Number(a.marginBalance ?? a.walletBalance ?? 0),
    }))
    .filter((c) => c.usdValue > 0.01 || Math.abs(c.walletBalance) > 0)
    .sort((a, b) => b.usdValue - a.usdValue);

  const walletBalance = Number(account.totalWalletBalance ?? 0);
  const upl = Number(account.totalUnrealizedProfit ?? 0);

  return {
    exchange: "binance",
    totalEquity: Number(account.totalMarginBalance ?? walletBalance + upl),
    totalWalletBalance: walletBalance,
    totalAvailableBalance: Number(account.availableBalance ?? 0),
    totalPerpUPL: upl,
    accountType: "USDT-M",
    coins,
  };
}

export async function fetchBinanceOpenPositions(): Promise<OpenPosition[]> {
  const list = await binanceGet<BinancePositionRisk[]>("/fapi/v2/positionRisk");
  return (list ?? [])
    .filter((p) => Math.abs(Number(p.positionAmt)) > 0)
    .map((p) => {
      const amt = Number(p.positionAmt);
      let side: "LONG" | "SHORT";
      if (p.positionSide === "LONG") side = "LONG";
      else if (p.positionSide === "SHORT") side = "SHORT";
      else side = amt > 0 ? "LONG" : "SHORT";

      return {
        exchange: "binance" as const,
        symbol: p.symbol,
        side,
        size: Math.abs(amt),
        avgPrice: Number(p.entryPrice),
        markPrice: Number(p.markPrice),
        unrealisedPnl: Number(p.unRealizedProfit),
        leverage: Number(p.leverage),
        liqPrice:
          p.liquidationPrice && Number(p.liquidationPrice) > 0
            ? Number(p.liquidationPrice)
            : null,
        takeProfit: null,
        stopLoss: null,
      };
    });
}

export async function fetchOkxWallet(): Promise<WalletSummary> {
  const rows = await okxPrivateGet<OkxBalanceRow[]>("/api/v5/account/balance");
  const account = rows?.[0];
  if (!account) return emptyWallet("okx", "TRADING");

  const coins = (account.details ?? [])
    .map((d) => ({
      coin: d.ccy,
      equity: Number(d.eq ?? 0),
      walletBalance: Number(d.cashBal ?? d.eq ?? 0),
      availableToWithdraw: Number(d.availBal ?? 0),
      unrealisedPnl: Number(d.upl ?? 0),
      usdValue: Number(d.eqUsd ?? d.eq ?? 0),
    }))
    .filter((c) => c.usdValue > 0.01 || Math.abs(c.walletBalance) > 0)
    .sort((a, b) => b.usdValue - a.usdValue);

  const totalEquity = Number(account.totalEq ?? 0);
  const totalUpl = coins.reduce((s, c) => s + c.unrealisedPnl, 0);
  const available = coins.reduce((s, c) => s + c.availableToWithdraw, 0);

  return {
    exchange: "okx",
    totalEquity,
    totalWalletBalance: totalEquity - totalUpl,
    totalAvailableBalance: available,
    totalPerpUPL: totalUpl,
    accountType: "TRADING",
    coins,
  };
}

export async function fetchOkxOpenPositions(): Promise<OpenPosition[]> {
  const list = await okxPrivateGet<OkxPositionRow[]>(
    "/api/v5/account/positions?instType=SWAP"
  );

  return (list ?? [])
    .filter((p) => Math.abs(Number(p.pos ?? 0)) > 0)
    .map((p) => {
      const pos = Number(p.pos ?? 0);
      const posSide = (p.posSide ?? "net").toLowerCase();
      let side: "LONG" | "SHORT";
      if (posSide === "long") side = "LONG";
      else if (posSide === "short") side = "SHORT";
      else side = pos > 0 ? "LONG" : "SHORT";

      return {
        exchange: "okx" as const,
        symbol: okxInstToSymbol(p.instId),
        side,
        size: Math.abs(pos),
        avgPrice: Number(p.avgPx ?? 0),
        markPrice: Number(p.markPx ?? 0),
        unrealisedPnl: Number(p.upl ?? 0),
        leverage: Number(p.lever ?? 0),
        liqPrice: p.liqPx && Number(p.liqPx) > 0 ? Number(p.liqPx) : null,
        takeProfit: null,
        stopLoss: null,
      };
    });
}

async function loadExchangeAccount(
  exchange: Exchange
): Promise<ExchangeAccount> {
  try {
    if (exchange === "bybit") {
      const [wallet, positions] = await Promise.all([
        fetchBybitWallet(),
        fetchBybitOpenPositions(),
      ]);
      return { exchange, wallet, positions };
    }
    if (exchange === "binance") {
      const [wallet, positions] = await Promise.all([
        fetchBinanceWallet(),
        fetchBinanceOpenPositions(),
      ]);
      return { exchange, wallet, positions };
    }
    const [wallet, positions] = await Promise.all([
      fetchOkxWallet(),
      fetchOkxOpenPositions(),
    ]);
    return { exchange, wallet, positions };
  } catch (err) {
    return {
      exchange,
      wallet: null,
      positions: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 설정된 API 키가 있는 거래소별 자산·포지션 */
export async function fetchWalletOverview(): Promise<WalletOverview> {
  const exchanges: Exchange[] = [];
  if (process.env.BYBIT_API_KEY && process.env.BYBIT_API_SECRET) {
    exchanges.push("bybit");
  }
  if (process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET) {
    exchanges.push("binance");
  }
  if (
    process.env.OKX_API_KEY?.trim() &&
    process.env.OKX_API_SECRET?.trim() &&
    (
      process.env.OKX_PASSPHRASE ??
      process.env.OKX_API_PASSPHRASE ??
      ""
    ).trim()
  ) {
    exchanges.push("okx");
  }

  const accounts =
    exchanges.length === 0
      ? []
      : await Promise.all(exchanges.map((ex) => loadExchangeAccount(ex)));

  const positions = accounts.flatMap((a) => a.positions);
  const wallets = accounts
    .map((a) => a.wallet)
    .filter((w): w is WalletSummary => w != null);

  const totalEquity = wallets.reduce((s, w) => s + w.totalEquity, 0);
  const totalWalletBalance = wallets.reduce(
    (s, w) => s + w.totalWalletBalance,
    0
  );
  const totalAvailableBalance = wallets.reduce(
    (s, w) => s + w.totalAvailableBalance,
    0
  );
  const totalPerpUPL = wallets.reduce((s, w) => s + w.totalPerpUPL, 0);

  const wallet: WalletSummary | null =
    wallets.length === 0
      ? null
      : {
          exchange: wallets[0].exchange,
          totalEquity,
          totalWalletBalance,
          totalAvailableBalance,
          totalPerpUPL,
          accountType: "ALL",
          coins: wallets.flatMap((w) =>
            w.coins.map((c) => ({ ...c, coin: `${w.exchange.toUpperCase()}:${c.coin}` }))
          ),
        };

  return {
    accounts,
    wallet,
    positions,
    totalEquity,
    totalWalletBalance,
    totalAvailableBalance,
    totalPerpUPL,
  };
}
