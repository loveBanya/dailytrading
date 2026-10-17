"use client";

import type { WalletOverview } from "@/lib/exchanges/wallet";
import type { GoalChallengePrefs } from "@/lib/prefs";
import type { DailyPnl } from "@/lib/stats/compute";
import { CompoundTrackerPanel } from "./CompoundTrackerPanel";

interface CompoundChallengesProps {
  wallet: WalletOverview | null;
  walletLoading?: boolean;
  daily: DailyPnl[];
  prefs: GoalChallengePrefs;
  onPrefsChange: (
    prefs: GoalChallengePrefs | ((p: GoalChallengePrefs) => GoalChallengePrefs)
  ) => void;
  onGoalUsdtChange?: (goalUsdt: number | null) => void;
}

function kstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export function CompoundChallenges({
  wallet,
  walletLoading,
  daily,
  prefs,
  onPrefsChange,
  onGoalUsdtChange,
}: CompoundChallengesProps) {
  function addChallenge() {
    onPrefsChange((p) => ({
      ...p,
      extraTracks: [
        ...p.extraTracks,
        {
          id: `t${Date.now().toString(36)}`,
          name: `챌린지 ${p.extraTracks.length + 2}`,
          trackSeedUsdt: 200,
          trackStart: kstToday(),
          trackDailyRatePct: 3,
          trackActual: {},
          walletFollow: p.walletFollow,
        },
      ],
    }));
  }

  function rename(id: string, name: string) {
    onPrefsChange((p) => ({
      ...p,
      extraTracks: p.extraTracks.map((track) =>
        track.id === id ? { ...track, name } : track
      ),
    }));
  }

  function remove(id: string, name: string) {
    if (!window.confirm(`"${name}" 챌린지와 적어 둔 실제 보유를 지울까요?`)) return;
    onPrefsChange((p) => ({
      ...p,
      extraTracks: p.extraTracks.filter((track) => track.id !== id),
    }));
  }

  return (
    <div className="space-y-6">
      <CompoundTrackerPanel
        prefs={prefs}
        onPrefsChange={onPrefsChange}
        wallet={wallet}
        walletLoading={walletLoading}
        daily={daily}
        onGoalUsdtChange={onGoalUsdtChange}
      />

      {prefs.extraTracks.map((track) => (
        <div
          key={track.id}
          className="space-y-4 rounded-xl border border-zinc-700/80 bg-zinc-950/30 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              value={track.name}
              onChange={(e) => rename(track.id, e.target.value)}
              aria-label="챌린지 이름"
              className="rounded-md border border-transparent bg-transparent px-1 py-0.5 text-base font-semibold text-zinc-100 outline-none hover:border-zinc-700 focus:border-zinc-500"
            />
            <button
              type="button"
              onClick={() => remove(track.id, track.name)}
              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-500 hover:border-rose-500/50 hover:text-rose-300"
            >
              챌린지 삭제
            </button>
          </div>
          <CompoundTrackerPanel
            prefs={prefs}
            onPrefsChange={onPrefsChange}
            wallet={wallet}
            walletLoading={walletLoading}
            daily={daily}
            extraId={track.id}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addChallenge}
        className="w-full rounded-lg border border-dashed border-zinc-700 py-2.5 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
      >
        + 챌린지 추가
      </button>
    </div>
  );
}
