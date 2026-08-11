"use client";

import { useEffect, useMemo, useState } from "react";
import {
  allTemplates,
  checklistProgress,
  cloneTemplate,
  loadChecklistOpen,
  loadChecklistState,
  newItem,
  resolveTemplate,
  saveChecklistOpen,
  saveChecklistState,
  type CheckAnswer,
  type ChecklistState,
  type TradeBias,
} from "@/lib/checklist";

interface TradeChecklistProps {
  /** compact: 메인 상단 체크용 / edit: 마인드 탭에서 규칙·템플릿 편집 */
  mode?: "compact" | "edit";
  /** localStorage에 값이 없을 때만 사용 (기본 접힘) */
  defaultOpen?: boolean;
}

/**
 * 규칙 체크는 OK / — / NG (준수 여부).
 * 전체 바이어스만 롱·관망·숏 — 규칙마다 방향을 물으면 헷갈림.
 */
export function TradeChecklist({
  mode = "compact",
  defaultOpen = false,
}: TradeChecklistProps) {
  const [state, setState] = useState<ChecklistState>(() =>
    loadChecklistState()
  );
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [tplName, setTplName] = useState("");

  useEffect(() => {
    setState(loadChecklistState());
    setOpen(loadChecklistOpen(defaultOpen));
    setReady(true);
  }, [defaultOpen]);

  useEffect(() => {
    if (!ready) return;
    saveChecklistState(state);
  }, [state, ready]);

  useEffect(() => {
    if (!ready || mode !== "compact") return;
    saveChecklistOpen(open);
  }, [open, ready, mode]);

  function toggleOpen() {
    setOpen((v) => !v);
  }

  const templates = useMemo(() => allTemplates(state), [state]);
  const tpl = useMemo(() => resolveTemplate(state), [state]);
  const prog = checklistProgress(tpl.items, state.answers);

  function patch(p: Partial<ChecklistState>) {
    setState((s) => ({ ...s, ...p }));
  }

  function setAnswer(itemId: string, answer: CheckAnswer) {
    setState((s) => ({
      ...s,
      answers: {
        ...s.answers,
        [itemId]: s.answers[itemId] === answer ? "unset" : answer,
      },
    }));
  }

  function resetAnswers() {
    patch({ answers: {}, bias: "unset" });
  }

  function upsertTemplateItems(
    templateId: string,
    items: ChecklistState["customTemplates"][0]["items"],
    name?: string
  ) {
    setState((s) => {
      const existing = s.customTemplates.find((t) => t.id === templateId);
      const base = resolveTemplate({ ...s, activeTemplateId: templateId });
      const nextTpl = {
        id: templateId,
        name: name ?? existing?.name ?? base.name,
        items,
      };
      const others = s.customTemplates.filter((t) => t.id !== templateId);
      return {
        ...s,
        customTemplates: [...others, nextTpl],
        activeTemplateId: templateId,
      };
    });
  }

  function addItem() {
    const t = newText.trim();
    if (!t) return;
    upsertTemplateItems(tpl.id, [...tpl.items, newItem(t)]);
    setNewText("");
  }

  function removeItem(id: string) {
    upsertTemplateItems(
      tpl.id,
      tpl.items.filter((i) => i.id !== id)
    );
    setState((s) => {
      const answers = { ...s.answers };
      delete answers[id];
      return { ...s, answers };
    });
  }

  function saveEdit(id: string) {
    const t = editText.trim();
    if (!t) return;
    upsertTemplateItems(
      tpl.id,
      tpl.items.map((i) => (i.id === id ? { ...i, text: t } : i))
    );
    setEditingId(null);
  }

  function switchTemplate(id: string) {
    patch({ activeTemplateId: id, answers: {}, bias: "unset" });
  }

  function duplicateAsCustom() {
    const name = tplName.trim() || `${tpl.name} 복사`;
    const cloned = cloneTemplate(tpl, name);
    setState((s) => ({
      ...s,
      customTemplates: [...s.customTemplates, cloned],
      activeTemplateId: cloned.id,
      answers: {},
      bias: "unset",
    }));
    setTplName("");
  }

  function renameTemplate() {
    const name = tplName.trim();
    if (!name) return;
    upsertTemplateItems(tpl.id, tpl.items, name);
    setTplName("");
  }

  function deleteCustomTemplate() {
    if (!confirm(`템플릿 「${tpl.name}」을 삭제할까요?`)) return;
    setState((s) => {
      const next = s.customTemplates.filter((t) => t.id !== tpl.id);
      return {
        ...s,
        customTemplates: next,
        activeTemplateId: next[0]?.id ?? "principles",
        answers: {},
        bias: "unset",
      };
    });
  }

  const biasBtns: { id: TradeBias; label: string; cls: string }[] = [
    { id: "long", label: "롱", cls: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" },
    { id: "watch", label: "관망", cls: "border-zinc-500/50 bg-zinc-500/15 text-zinc-300" },
    { id: "short", label: "숏", cls: "border-rose-500/50 bg-rose-500/15 text-rose-300" },
  ];

  const biasLabel =
    state.bias === "long"
      ? "롱"
      : state.bias === "short"
        ? "숏"
        : state.bias === "watch"
          ? "관망"
          : "방향—";

  const titleBlock = (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <p className="text-sm font-semibold text-zinc-100">매매 체크리스트</p>
      <span className="text-[11px] tabular-nums text-zinc-500">
        OK {prog.ok} · NG {prog.ng} · 남음 {prog.unset}
      </span>
      {mode === "compact" && !open && (
        <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
          {tpl.name} · {biasLabel}
        </span>
      )}
    </div>
  );

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {mode === "compact" ? (
        <button
          type="button"
          onClick={toggleOpen}
          className="min-w-0 text-left"
          aria-expanded={open}
        >
          {titleBlock}
        </button>
      ) : (
        titleBlock
      )}
      <div className="flex flex-wrap gap-1.5">
        {mode === "compact" && (
          <button
            type="button"
            onClick={toggleOpen}
            className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
          >
            {open ? "접기 ▲" : "펼치기 ▼"}
          </button>
        )}
        <button
          type="button"
          onClick={resetAnswers}
          className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
        >
          체크 초기화
        </button>
      </div>
    </div>
  );

  const templateSelect = (
    <label className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
      템플릿
      <select
        value={tpl.id}
        onChange={(e) => switchTemplate(e.target.value)}
        className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200"
      >
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );

  const biasRow = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-zinc-500">이번 방향</span>
      {biasBtns.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() =>
            patch({ bias: state.bias === b.id ? "unset" : b.id })
          }
          className={`min-h-10 min-w-[4.5rem] rounded-lg border px-3 py-2 text-sm font-medium transition ${
            state.bias === b.id
              ? b.cls
              : "border-zinc-800 text-zinc-500 hover:border-zinc-600"
          }`}
        >
          {b.label}
        </button>
      ))}
    </div>
  );

  const rows = (
    <ul className="divide-y divide-zinc-800/80 overflow-hidden rounded-lg border border-zinc-800">
      {tpl.items.length === 0 && (
        <li className="px-3 py-6 text-center text-xs text-zinc-500">
          규칙이 없습니다. 아래에서 추가하세요.
        </li>
      )}
      {tpl.items.map((item, idx) => {
        const ans = state.answers[item.id] ?? "unset";
        return (
          <li
            key={item.id}
            className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
          >
            <span className="w-5 shrink-0 text-[11px] tabular-nums text-zinc-600">
              {idx + 1}
            </span>
            {mode === "edit" && editingId === item.id ? (
              <input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit(item.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <p className="min-w-0 flex-1 text-sm leading-snug text-zinc-200">
                {item.text}
              </p>
            )}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "ok" as const, label: "OK", on: "border-emerald-500/60 bg-emerald-500/20 text-emerald-300" },
                  { id: "unset" as const, label: "—", on: "border-zinc-500/50 bg-zinc-700/40 text-zinc-200" },
                  { id: "ng" as const, label: "NG", on: "border-rose-500/60 bg-rose-500/20 text-rose-300" },
                ] as const
              ).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setAnswer(item.id, b.id)}
                  className={`min-h-10 min-w-12 rounded-lg border px-2.5 text-xs font-semibold transition ${
                    ans === b.id
                      ? b.on
                      : "border-zinc-800 text-zinc-600 hover:border-zinc-600"
                  }`}
                >
                  {b.label}
                </button>
              ))}
              {mode === "edit" && (
                <>
                  {editingId === item.id ? (
                    <button
                      type="button"
                      onClick={() => saveEdit(item.id)}
                      className="rounded border border-emerald-500/40 px-2 py-1 text-[11px] text-emerald-300"
                    >
                      저장
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(item.id);
                        setEditText(item.text);
                      }}
                      className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-500"
                    >
                      수정
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-rose-400/80"
                  >
                    삭제
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );

  if (mode === "compact") {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 shadow-lg shadow-black/20 backdrop-blur sm:p-4">
        {header}
        {open && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {templateSelect}
              {biasRow}
            </div>
            {rows}
            <p className="text-[11px] text-zinc-600">
              규칙은 OK/NG로 체크 · 방향은 롱/관망/숏. 템플릿·문구 편집은「매매
              마인드」탭.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        메인 상단 체크리스트와 연동됩니다. 규칙은{" "}
        <span className="text-zinc-300">OK / — / NG</span>로 준수 여부를 보고,
        매매 방향만 <span className="text-zinc-300">롱 · 관망 · 숏</span>으로
        고릅니다.
      </p>
      {header}
      <div className="flex flex-wrap items-end gap-2">
        {templateSelect}
        {biasRow}
      </div>
      {rows}

      <div className="flex flex-wrap gap-2">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="새 규칙 추가"
          className="min-w-[12rem] flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          onKeyDown={(e) => {
            if (e.key === "Enter") addItem();
          }}
        />
        <button
          type="button"
          onClick={addItem}
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
        >
          규칙 추가
        </button>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
        <p className="text-xs font-medium text-zinc-400">템플릿 관리</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            placeholder="새 이름"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200"
          />
          <button
            type="button"
            onClick={duplicateAsCustom}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300"
          >
            현재 템플릿 복제
          </button>
          <button
            type="button"
            onClick={renameTemplate}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300"
          >
            이름 변경
          </button>
          {state.customTemplates.some((t) => t.id === tpl.id) && (
            <button
              type="button"
              onClick={deleteCustomTemplate}
              className="rounded-md border border-rose-500/30 px-3 py-2 text-xs text-rose-300/90"
            >
              이 템플릿 삭제
            </button>
          )}
        </div>
        <p className="text-[11px] text-zinc-600">
          기본 예시는 원칙 / EMA200·MACD / 진입 직전 / 리스크·멘탈 입니다. 복제
          후 자유롭게 고치세요.
        </p>
      </div>
    </div>
  );
}
