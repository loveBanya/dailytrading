"use client";

interface StudyRoadmapPanelProps {
  onNavigate?: (tab: string) => void;
}

const STEPS: Array<{
  step: number;
  title: string;
  body: string;
  tabs: Array<{ id: string; label: string }>;
}> = [
  {
    step: 1,
    title: "기초 · 생존 규칙",
    body: "일일 최대 손실 한도(예: 자산의 1~2%)를 정하고, 포지션 크기를 먼저 계산하세요. 매매마다 일지에 이유를 남기는 습관이 오답노트보다 우선입니다.",
    tabs: [
      { id: "mindset", label: "매매 마인드" },
      { id: "trades", label: "매매 기록" },
    ],
  },
  {
    step: 2,
    title: "차트 · EMA200 + MACD 0선",
    body: "롱: 가격이 200EMA 위 + (0선 위 골든크로스 또는 골든 상태에서 0선 상향 돌파). 숏은 반대. 스크리너 「EMA200·0선」 필터로 후보를 좁히세요.",
    tabs: [
      { id: "screener", label: "코인 스크리너" },
      { id: "screener-watch", label: "지정 평가" },
    ],
  },
  {
    step: 3,
    title: "실행 · 검증 후 실매매",
    body: "스크리너 후보 → 지정 평가로 점수 확인 → 가상투자로 수익률을 본 뒤 실매매. 충동 진입은 오답노트로 바로 표시하세요.",
    tabs: [
      { id: "screener-perf", label: "스크리너 성과" },
      { id: "review", label: "오답노트" },
    ],
  },
  {
    step: 4,
    title: "자금 관리 · 유입 기록",
    body: "업비트에서 만든 USDT를 선물 지갑으로 옮길 때마다 「USDT 자본 흐름」에 기록하세요. 켈리/고정비율로 베팅 크기를 제한합니다.",
    tabs: [
      { id: "cash", label: "입출금" },
      { id: "overview", label: "한눈에·켈리" },
    ],
  },
  {
    step: 5,
    title: "세금 · 기록 (2027 대비)",
    body: "2027-01-01부터 가상자산 양도차익 과세가 예정되어 있습니다. 취득가·이체·실현손익을 저널과 자본 흐름에 남겨 두면 신고가 수월합니다. 1억 챌린지는 과세 직전 목표일 뿐입니다.",
    tabs: [
      { id: "overview", label: "1억 챌린지" },
      { id: "cash", label: "자본 흐름" },
    ],
  },
];

export function StudyRoadmapPanel({ onNavigate }: StudyRoadmapPanelProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        1억 챌린지를 버티려면 수익률보다 프로세스입니다. 아래 순서로 앱 기능을
        쓰며 공부하세요.
      </p>
      <ol className="space-y-3">
        {STEPS.map((s) => (
          <li
            key={s.step}
            className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                STEP {s.step}
              </span>
              <h3 className="text-sm font-semibold text-zinc-100">{s.title}</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              {s.body}
            </p>
            {onNavigate && (
              <div className="mt-3 flex flex-wrap gap-2">
                {s.tabs.map((t) => (
                  <button
                    key={`${s.step}-${t.id}`}
                    type="button"
                    onClick={() => onNavigate(t.id)}
                    className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 transition hover:border-emerald-500/40 hover:text-emerald-300"
                  >
                    → {t.label}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
