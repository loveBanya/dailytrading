import type { Candle } from "./klines";

/**
 * Bybit closed-pnl 은 createdTime≈updatedTime(청산시각)만 주는 경우가 많음.
 * 캔들을 역방향으로 훑어 진입가에 닿은 구간으로 진입 시각을 추정한다.
 */
export function estimateEntryTimeSec(
  candles: Candle[],
  entryPrice: number,
  exitTimeSec: number,
  side: "LONG" | "SHORT"
): number | null {
  if (!candles.length || !entryPrice) return null;

  let exitIdx = candles.length - 1;
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].time <= exitTimeSec) {
      exitIdx = i;
      break;
    }
  }

  const tol = Math.max(entryPrice * 0.0015, 1e-8);
  const touches: number[] = [];

  for (let i = exitIdx; i >= 0; i--) {
    const c = candles[i];
    if (c.low - tol <= entryPrice && entryPrice <= c.high + tol) {
      touches.push(i);
    }
  }

  if (touches.length === 0) {
    // 진입가 미터치 — 청산 방향과 반대로 멀어지기 시작한 지점 근처 탐색
    for (let i = exitIdx - 1; i >= 0; i--) {
      const c = candles[i];
      const mid = (c.high + c.low) / 2;
      if (side === "LONG" && mid <= entryPrice * 1.002) {
        return c.time;
      }
      if (side === "SHORT" && mid >= entryPrice * 0.998) {
        return c.time;
      }
    }
    return null;
  }

  // 청산 직전에서 거슬러 올라가며, 연속으로 진입가를 터치한 구간의 "시작"
  // = 가장 최근 터치 클러스터의 가장 이른 캔들
  const recent: number[] = [touches[0]];
  for (let i = 1; i < touches.length; i++) {
    if (recent[recent.length - 1] - touches[i] <= 3) {
      recent.push(touches[i]);
    } else {
      break;
    }
  }

  // 클러스터가 너무 짧으면 조금 더 이전 터치까지 확장
  let startIdx = recent[recent.length - 1];
  if (recent.length <= 2 && touches.length > recent.length) {
    // 그다음 클러스터도 가깝면 포함
    for (let i = recent.length; i < touches.length; i++) {
      if (startIdx - touches[i] <= 8) {
        startIdx = touches[i];
      } else break;
    }
  }

  // 롱: 진입 후 상승 시작점 / 숏: 진입 후 하락 시작점에 가깝게
  // 클러스터 시작에서 한두 봉 앞을 진입으로
  const entryIdx = Math.max(0, startIdx);
  return candles[entryIdx].time;
}

/** 추정 진입시각으로 보유 분 계산 */
export function estimateDurationMinutes(
  entrySec: number,
  exitSec: number
): number {
  return Math.max(0, Math.round((exitSec - entrySec) / 60));
}
