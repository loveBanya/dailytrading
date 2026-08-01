/** 본문 인라인 이미지용 — 파일/클립보드 → 압축 data URL */

export async function fileToCompressedDataUrl(
  file: File,
  maxWidth = 1200,
  quality = 0.82
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 넣을 수 있습니다.");
  }
  if (file.size > 8_000_000) {
    throw new Error("이미지가 너무 큽니다 (8MB 이하).");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지 처리 실패");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const mime =
    file.type === "image/png" || file.type === "image/webp"
      ? "image/jpeg"
      : file.type.startsWith("image/")
        ? "image/jpeg"
        : "image/jpeg";

  const dataUrl = canvas.toDataURL(mime, quality);
  if (dataUrl.length > 1_800_000) {
    // 한 번 더 줄임
    const dataUrl2 = canvas.toDataURL("image/jpeg", 0.65);
    if (dataUrl2.length > 1_800_000) {
      throw new Error("이미지가 너무 큽니다. 더 작은 사진을 넣어주세요.");
    }
    return dataUrl2;
  }
  return dataUrl;
}

/** 저장/표시용 — script 등 제거, img/br/p/div/span만 허용 */
export function sanitizeRichHtml(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined") {
    return html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+="[^"]*"/gi, "")
      .replace(/\son\w+='[^']*'/gi, "");
  }

  const doc = new DOMParser().parseFromString(
    `<div id="root">${html}</div>`,
    "text/html"
  );
  const root = doc.getElementById("root");
  if (!root) return "";

  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === "img") {
          const src = el.getAttribute("src") ?? "";
          if (
            !src.startsWith("data:image/") &&
            !src.startsWith("https://") &&
            !src.startsWith("http://")
          ) {
            el.remove();
            continue;
          }
          // strip other attrs
          for (const attr of Array.from(el.attributes)) {
            if (attr.name !== "src" && attr.name !== "alt") {
              el.removeAttribute(attr.name);
            }
          }
          el.setAttribute("alt", el.getAttribute("alt") ?? "");
          continue;
        }
        if (
          tag === "br" ||
          tag === "div" ||
          tag === "p" ||
          tag === "span" ||
          tag === "b" ||
          tag === "i" ||
          tag === "strong" ||
          tag === "em"
        ) {
          for (const attr of Array.from(el.attributes)) {
            el.removeAttribute(attr.name);
          }
          walk(el);
          continue;
        }
        // unwrap unknown tags
        while (el.firstChild) {
          node.insertBefore(el.firstChild, el);
        }
        el.remove();
      } else if (child.nodeType === Node.COMMENT_NODE) {
        child.parentNode?.removeChild(child);
      }
    }
  };

  walk(root);
  return root.innerHTML;
}

export function richBodyIsEmpty(html: string): boolean {
  const text = html
    .replace(/<img\b[^>]*>/gi, "img")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
  return text.length === 0;
}
