const FOLD_KEY = "dailytrading.calcfold";
const PIN_KEY = "dailytrading.calcpin";

export type PipHost = {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
  readonly window: Window | null;
};

export function pipHost(): PipHost | null {
  return (
    (window as Window & { documentPictureInPicture?: PipHost })
      .documentPictureInPicture ?? null
  );
}

export function pipWindow(): Window | null {
  const pip = pipHost()?.window ?? null;
  return pip && !pip.closed ? pip : null;
}

export function calcFolded(): boolean {
  try {
    return localStorage.getItem(FOLD_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveCalcFolded(folded: boolean) {
  try {
    localStorage.setItem(FOLD_KEY, folded ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** 기본은 맨 위 고정. "0"일 때만 일반 창 */
export function calcPinned(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveCalcPinned(pinned: boolean) {
  try {
    localStorage.setItem(PIN_KEY, pinned ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function calcWindowSize(folded: boolean): { width: number; height: number } {
  return folded ? { width: 200, height: 320 } : { width: 920, height: 760 };
}

export function popupFeatures(size: { width: number; height: number }) {
  return `popup=yes,width=${size.width},height=${size.height},left=80,top=80,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`;
}

export function resizeCalcWindow(folded: boolean) {
  const pip = pipWindow();
  const target = pip ?? (window.opener ? window : null);
  if (!target) return;
  const size = calcWindowSize(folded);
  try {
    target.resizeTo(size.width + 16, size.height + 40);
  } catch {
    /* 브라우저가 크기 변경을 막을 수 있다 */
  }
}

export function openPlainCalc(view: Window = window) {
  const size = calcWindowSize(calcFolded());
  const popup = view.open("/calc", "dailytrading-calc", popupFeatures(size));
  if (!popup) return null;
  popup.focus();
  try {
    popup.resizeTo(size.width + 16, size.height + 40);
    popup.moveTo(80, 80);
  } catch {
    /* ignore */
  }
  return popup;
}
