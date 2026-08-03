const COOKIE_NAME = "dt_session";

export { COOKIE_NAME };

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlEncodeStr(s: string): string {
  return b64url(new TextEncoder().encode(s));
}

function b64urlDecodeToStr(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return b64url(sig);
}

export function getAuthConfig(): {
  user: string;
  password: string;
  secret: string;
} | null {
  const user = process.env.APP_AUTH_USER?.trim();
  const password = process.env.APP_AUTH_PASSWORD ?? "";
  if (!user || !password) return null;
  const secret =
    process.env.APP_AUTH_SECRET?.trim() ||
    `dailytrading:${user}:${password}`;
  return { user, password, secret };
}

/** 세션 토큰 발급 (userB64.exp.sig) */
export async function createSessionToken(
  username: string,
  secret: string,
  maxAgeSec: number
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
  const payload = `${b64urlEncodeStr(username)}.${exp}`;
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
  expectedUser: string
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [uB64, expStr, sig] = parts;
  if (!uB64 || !expStr || !sig) return false;

  const payload = `${uB64}.${expStr}`;
  const expect = await hmacSign(payload, secret);
  if (expect !== sig) return false;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  try {
    return b64urlDecodeToStr(uB64) === expectedUser;
  } catch {
    return false;
  }
}

export const SESSION_MAX_AGE = {
  remember: 60 * 24 * 60 * 60, // 60일
  session: 12 * 60 * 60, // 12시간
} as const;
