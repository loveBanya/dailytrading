/** 매매 체크리스트 — 규칙별 OK/NG + 전체 바이어스(롱/관망/숏) */

export type CheckAnswer = "ok" | "ng" | "unset";
export type TradeBias = "long" | "watch" | "short" | "unset";

export interface ChecklistItem {
  id: string;
  text: string;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  items: ChecklistItem[];
}

export interface ChecklistState {
  activeTemplateId: string;
  /** 템플릿별 커스텀 오버라이드 (없으면 기본 템플릿) */
  customTemplates: ChecklistTemplate[];
  /** itemId → answer (세션용, 초기화 가능) */
  answers: Record<string, CheckAnswer>;
  bias: TradeBias;
}

function nid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const BUILTIN_CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  {
    id: "principles",
    name: "기본 원칙",
    items: [
      { id: "p1", text: "오늘 손실 한도 남아 있는가" },
      { id: "p2", text: "복수·보복 매매가 아닌가" },
      { id: "p3", text: "포지션 크기가 규칙 이내인가" },
      { id: "p4", text: "손절·목표가 미리 정해졌는가" },
      { id: "p5", text: "뉴스/이벤트 리스크를 확인했는가" },
    ],
  },
  {
    id: "ema200_macd",
    name: "EMA200·MACD0선",
    items: [
      { id: "e1", text: "가격이 200EMA 위(롱) / 아래(숏)인가" },
      { id: "e2", text: "0선 위 골든 or 골든 상태 0선 돌파(롱)인가" },
      { id: "e3", text: "0선 아래 데드 or 데드 상태 0선 이탈(숏)인가" },
      { id: "e4", text: "상위 TF(1h) 방향과 충돌하지 않는가" },
      { id: "e5", text: "추격 구간(급등·급락)이 아닌가" },
    ],
  },
  {
    id: "turtle_donchian",
    name: "터틀·돈치안",
    items: [
      { id: "t1", text: "최근 20봉 고점 돌파(롱) / 저점 이탈(숏)인가" },
      { id: "t2", text: "손절을 2×ATR(20)로 잡았는가" },
      { id: "t3", text: "청산은 10봉 반대 채널로 정해 두었는가" },
      { id: "t4", text: "이번 거래 위험이 계좌의 일정 %(예:1%) 이내인가" },
      { id: "t5", text: "조건이 없으면 관망하는가 (억지 진입 금지)" },
    ],
  },
  {
    id: "pre_entry",
    name: "진입 직전",
    items: [
      { id: "x1", text: "왜 지금 들어가는지 한 줄로 말할 수 있는가" },
      { id: "x2", text: "무효화(손절) 조건이 명확한가" },
      { id: "x3", text: "RR이 최소 기준 이상인가" },
      { id: "x4", text: "이미 열린 포지션과 상관·과다노출이 없는가" },
      { id: "x5", text: "체결 후 일지에 기록할 준비가 됐는가" },
    ],
  },
  {
    id: "risk",
    name: "리스크·멘탈",
    items: [
      { id: "r1", text: "수면·컨디션이 괜찮은가" },
      { id: "r2", text: "FOMO로 진입하려는 게 아닌가" },
      { id: "r3", text: "계획에 없는 코인/전략이 아닌가" },
      { id: "r4", text: "레버리지가 과도하지 않은가" },
    ],
  },
];

const KEY = "dailytrading.checklist.v1";
const OPEN_KEY = "dailytrading.checklist.open.v1";

export function defaultChecklistState(): ChecklistState {
  return {
    activeTemplateId: "principles",
    customTemplates: [],
    answers: {},
    bias: "unset",
  };
}

export function loadChecklistOpen(fallback = false): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (raw === null) return fallback;
    return raw === "1";
  } catch {
    return fallback;
  }
}

export function saveChecklistOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function allTemplates(state: ChecklistState): ChecklistTemplate[] {
  const customIds = new Set(state.customTemplates.map((t) => t.id));
  const builtins = BUILTIN_CHECKLIST_TEMPLATES.filter((t) => !customIds.has(t.id));
  // 커스텀이 빌트인 id를 덮어쓴 경우 custom 우선
  const overridden = BUILTIN_CHECKLIST_TEMPLATES.filter((t) =>
    customIds.has(t.id)
  ).map((t) => state.customTemplates.find((c) => c.id === t.id)!);
  const pureCustom = state.customTemplates.filter(
    (t) => !BUILTIN_CHECKLIST_TEMPLATES.some((b) => b.id === t.id)
  );
  return [...overridden, ...builtins, ...pureCustom];
}

export function resolveTemplate(state: ChecklistState): ChecklistTemplate {
  const list = allTemplates(state);
  return (
    list.find((t) => t.id === state.activeTemplateId) ??
    list[0] ??
    BUILTIN_CHECKLIST_TEMPLATES[0]!
  );
}

export function loadChecklistState(): ChecklistState {
  if (typeof window === "undefined") return defaultChecklistState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultChecklistState();
    const saved = JSON.parse(raw) as Partial<ChecklistState>;
    return {
      ...defaultChecklistState(),
      ...saved,
      customTemplates: Array.isArray(saved.customTemplates)
        ? saved.customTemplates
        : [],
      answers:
        saved.answers && typeof saved.answers === "object"
          ? saved.answers
          : {},
      bias: saved.bias ?? "unset",
    };
  } catch {
    return defaultChecklistState();
  }
}

export function saveChecklistState(state: ChecklistState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function newItem(text: string): ChecklistItem {
  return { id: nid(), text: text.trim() };
}

export function cloneTemplate(
  base: ChecklistTemplate,
  name: string
): ChecklistTemplate {
  return {
    id: nid(),
    name,
    items: base.items.map((i) => ({ id: nid(), text: i.text })),
  };
}

export function checklistProgress(
  items: ChecklistItem[],
  answers: Record<string, CheckAnswer>
): { ok: number; ng: number; unset: number; total: number } {
  let ok = 0;
  let ng = 0;
  let unset = 0;
  for (const it of items) {
    const a = answers[it.id] ?? "unset";
    if (a === "ok") ok += 1;
    else if (a === "ng") ng += 1;
    else unset += 1;
  }
  return { ok, ng, unset, total: items.length };
}
