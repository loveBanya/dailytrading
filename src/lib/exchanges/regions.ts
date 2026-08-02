/**
 * Vercel 서버리스 기본 리전(iad1 미국)에서는
 * Bybit CloudFront / Binance 지역제한(451)에 걸리는 경우가 많음.
 * 거래소 공개·개인 API를 호출하는 라우트는 아시아 리전을 선호합니다.
 */
export const EXCHANGE_API_REGIONS = ["sin1", "hnd1", "icn1"] as const;
