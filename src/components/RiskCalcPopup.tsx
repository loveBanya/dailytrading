"use client";

import { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CalcWindow } from "./CalcWindow";
import {
  calcFolded,
  calcPinned,
  calcWindowSize,
  openPlainCalc,
  pipHost,
  type PipHost,
} from "./calc-host";

let pipRoot: Root | null = null;

function copyStyles(pip: Window) {
  const doc = pip.document;
  doc.title = "계산";
  doc.documentElement.lang = "ko";
  doc.documentElement.className = document.documentElement.className;
  doc.body.className = document.body.className;
  doc.body.style.margin = "0";
  doc.body.style.background = "#09090b";
  doc.body.style.color = "#f4f4f5";
  for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
    doc.head.appendChild(node.cloneNode(true));
  }
}

function mountCalc(pip: Window) {
  pipRoot?.unmount();
  const mount = pip.document.createElement("div");
  mount.style.height = "100%";
  pip.document.body.appendChild(mount);
  pipRoot = createRoot(mount);
  pipRoot.render(<CalcWindow />);
  pip.addEventListener(
    "pagehide",
    () => {
      pipRoot?.unmount();
      pipRoot = null;
    },
    { once: true }
  );
}

async function openPip(host: PipHost): Promise<boolean> {
  if (host.window && !host.window.closed) {
    host.window.focus();
    return true;
  }
  try {
    const pip = await host.requestWindow(calcWindowSize(calcFolded()));
    copyStyles(pip);
    mountCalc(pip);
    return true;
  } catch {
    return false;
  }
}

export function RiskCalcPopup() {
  useEffect(() => {
    const hostWindow = window as Window & {
      __dtOpenCalcPip?: () => Promise<boolean>;
    };
    hostWindow.__dtOpenCalcPip = async () => {
      const host = pipHost();
      if (!host) return false;
      return openPip(host);
    };
    return () => {
      delete hostWindow.__dtOpenCalcPip;
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const host = pipHost();
        if (calcPinned() && host) {
          void openPip(host).then((ok) => {
            if (!ok) openPlainCalc();
          });
          return;
        }
        if (host?.window && !host.window.closed) {
          host.window.focus();
          return;
        }
        openPlainCalc();
      }}
      className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
    >
      계산
    </button>
  );
}
