/** 초인종/딩 톤 — Web Audio (별도 mp3 불필요) */
let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx) {
    sharedCtx = new AudioContext();
  }
  return sharedCtx;
}

function tone(
  ctx: AudioContext,
  freq: number,
  start: number,
  dur: number,
  gain = 0.22
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** 딩~딩 (초인종 느낌) */
export async function playDing(times = 2): Promise<void> {
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    for (let i = 0; i < times; i++) {
      const at = t0 + i * 0.38;
      tone(ctx, 880, at, 0.18, 0.2);
      tone(ctx, 1320, at + 0.04, 0.22, 0.12);
    }
  } catch {
    /* autoplay 차단 등 — 무시 */
  }
}

export async function playDoorbell(): Promise<void> {
  return playDing(2);
}
