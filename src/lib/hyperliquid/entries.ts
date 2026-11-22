import type { HlFill, HlRecentEntry, HlSide } from "./types";

/** 같은 진입으로 묶는 체결 간격 */
const GROUP_GAP_MS = 60 * 60 * 1000;

function entrySide(dir: string): { side: HlSide; kind: "OPEN" | "FLIP" } | null {
  if (dir === "Open Long") return { side: "LONG", kind: "OPEN" };
  if (dir === "Open Short") return { side: "SHORT", kind: "OPEN" };
  if (dir === "Short > Long") return { side: "LONG", kind: "FLIP" };
  if (dir === "Long > Short") return { side: "SHORT", kind: "FLIP" };
  return null;
}

export function groupEntryFills(
  trader: { id: string; label: string | null; address: string },
  fills: HlFill[],
  sinceMs: number
): HlRecentEntry[] {
  const opens = fills
    .filter((f) => f.time >= sinceMs && entrySide(f.dir))
    .sort((a, b) => a.time - b.time);

  const open = new Map<string, HlRecentEntry>();
  const out: HlRecentEntry[] = [];

  for (const f of opens) {
    const es = entrySide(f.dir)!;
    const key = `${f.coin}:${es.side}`;
    const cur = open.get(key);
    const notional = f.px * f.sz;
    if (cur && f.time - cur.lastTime <= GROUP_GAP_MS) {
      cur.size += f.sz;
      cur.notional += notional;
      cur.avgPx = cur.size > 0 ? cur.notional / cur.size : f.px;
      cur.fills += 1;
      cur.lastTime = f.time;
      if (es.kind === "FLIP") cur.kind = "FLIP";
      continue;
    }
    const entry: HlRecentEntry = {
      traderId: trader.id,
      label: trader.label,
      address: trader.address,
      coin: f.coin,
      side: es.side,
      kind: es.kind,
      size: f.sz,
      avgPx: f.px,
      notional,
      fills: 1,
      firstTime: f.time,
      lastTime: f.time,
    };
    open.set(key, entry);
    out.push(entry);
  }

  return out;
}
