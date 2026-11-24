/** 브라우저 SpeechSynthesis — 한국어 알람 읽기 */

/** 첫 클릭 등에서 호출해 음성 엔진 잠금 해제 */
export function unlockTts(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const warm = new SpeechSynthesisUtterance(" ");
    warm.volume = 0;
    warm.lang = "ko-KR";
    window.speechSynthesis.speak(warm);
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

function pickKoVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find(
      (v) => v.lang === "ko-KR" && /neural|premium|google/i.test(v.name)
    ) ??
    voices.find((v) => v.lang === "ko-KR") ??
    voices.find((v) => v.lang.toLowerCase().startsWith("ko")) ??
    null
  );
}

/** volume 0~1 */
export function speakAlarm(
  text: string,
  volume = 0.85,
  opts?: { interrupt?: boolean }
): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return;
  const vol = Math.max(0, Math.min(1, volume));
  if (vol <= 0.001) return;

  try {
    if (opts?.interrupt !== false) window.speechSynthesis.cancel();

    const speak = () => {
      const u = new SpeechSynthesisUtterance(cleaned);
      u.lang = "ko-KR";
      u.rate = 1.08;
      u.pitch = 1;
      u.volume = vol;
      const voice = pickKoVoice();
      if (voice) u.voice = voice;
      window.speechSynthesis.speak(u);
    };

    if (window.speechSynthesis.getVoices().length === 0) {
      const once = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", once);
        speak();
      };
      window.speechSynthesis.addEventListener("voiceschanged", once);
      // voices가 이미 준비된 경우 대비 짧은 폴백
      window.setTimeout(() => {
        if (window.speechSynthesis.getVoices().length > 0) {
          window.speechSynthesis.removeEventListener("voiceschanged", once);
          speak();
        }
      }, 250);
      return;
    }
    speak();
  } catch {
    /* autoplay / permission */
  }
}

/** 알람용 짧은 한국어 문장 */
export function alarmSpeechText(title: string, body: string): string {
  const t = title.replace(/HL/gi, "에이치엘").replace(/\$/g, "달러 ");
  const b = body
    .replace(/HL/gi, "에이치엘")
    .replace(/LONG/gi, "롱")
    .replace(/SHORT/gi, "숏")
    .replace(/\$/g, "달러 ")
    .replace(/·/g, ", ");
  return b ? `${t}. ${b}` : t;
}
