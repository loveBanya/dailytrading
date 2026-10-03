import type { WalletOverview } from "@/lib/exchanges/wallet";

/** "all" 또는 "binance:USDC" 처럼 거래소 하나의 코인 */
export const DEFAULT_WALLET_FOLLOW = "binance:USDC";

const EXCHANGE_SHORT: Record<string, string> = {
  binance: "바낸",
  bybit: "바이빗",
  okx: "OKX",
};

const COIN_SHORT: Record<string, string> = {
  USDT: "테더",
  USDC: "USDC",
};

export function normalizeWalletFollow(value: unknown): string {
  if (value === "all") return "all";
  if (typeof value !== "string") return DEFAULT_WALLET_FOLLOW;
  const [exchange, coin] = value.split(":");
  if (!exchange || !coin || !/^[a-z0-9]+$/i.test(exchange) || !/^[A-Z0-9]+$/i.test(coin)) {
    return DEFAULT_WALLET_FOLLOW;
  }
  return `${exchange.toLowerCase()}:${coin.toUpperCase()}`;
}

export function walletFollowLabel(follow: string | undefined): string {
  const id = normalizeWalletFollow(follow);
  if (id === "all") return "합계";
  const [exchange, coin] = id.split(":");
  const ex = EXCHANGE_SHORT[exchange] ?? exchange;
  const name = COIN_SHORT[coin] ?? coin;
  return `${ex} ${name}`;
}

export function followedEquity(
  wallet: WalletOverview | null | undefined,
  follow: string | undefined
): number {
  if (!wallet) return 0;
  const id = normalizeWalletFollow(follow);
  if (id === "all") return wallet.totalEquity;
  const [exchange, coin] = id.split(":");
  const account = wallet.accounts.find((row) => row.exchange === exchange);
  const asset = account?.wallet?.coins.find((row) => row.coin.toUpperCase() === coin);
  if (!asset) return 0;
  return asset.usdValue > 0.01 ? asset.usdValue : asset.equity;
}

const ALWAYS_LISTED = new Set(["USDT", "USDC"]);

export function walletFollowOptions(
  wallet: WalletOverview | null | undefined
): Array<{ id: string; label: string; amount: number }> {
  const rows: Array<{ id: string; label: string; amount: number }> = [
    { id: "all", label: "합계", amount: wallet?.totalEquity ?? 0 },
  ];
  for (const account of wallet?.accounts ?? []) {
    for (const coin of account.wallet?.coins ?? []) {
      const name = coin.coin.toUpperCase();
      const amount = coin.usdValue > 0.01 ? coin.usdValue : coin.equity;
      if (amount <= 0.5 && !ALWAYS_LISTED.has(name)) continue;
      const id = `${account.exchange}:${name}`;
      rows.push({ id, label: walletFollowLabel(id), amount });
    }
  }
  return rows;
}
