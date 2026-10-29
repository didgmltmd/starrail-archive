// Talks to the friend server running on the host PC (server/index.mjs).
// The server's public address changes when it restarts, so it publishes the current one
// to the repo's `server` branch; apps read it from there. On the host PC itself the
// local address is used directly.

const ADDRESS_URL = "https://raw.githubusercontent.com/didgmltmd/starrail-archive/server/server.json";
const LOCAL = "http://127.0.0.1:8787";
const KEY_SECRET = "sra.friends.secret";
const KEY_LAST_URL = "sra.server.lastUrl";

async function withTimeout(url: string, ms: number, init?: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function healthy(base: string, ms: number) {
  try {
    const r = await withTimeout(`${base}/api/health`, ms);
    return r.ok && (await r.json())?.app === "starrail-archive";
  } catch {
    return false;
  }
}

let resolving: Promise<string> | null = null;

/** Finds a reachable server address, or throws a friendly error. */
export function serverBase(): Promise<string> {
  resolving ??= (async () => {
    if (await healthy(LOCAL, 400)) return LOCAL;

    const candidates: string[] = [];
    try {
      const r = await withTimeout(`${ADDRESS_URL}?t=${Date.now()}`, 5000, { cache: "no-store" });
      if (r.ok) {
        const info = (await r.json()) as { url?: string };
        if (info.url && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(info.url)) candidates.push(info.url);
      }
    } catch {
      // GitHub unreachable: fall back to the last address that worked
    }
    const last = localStorage.getItem(KEY_LAST_URL);
    if (last && !candidates.includes(last)) candidates.push(last);

    for (const c of candidates) {
      if (await healthy(c, 6000)) {
        localStorage.setItem(KEY_LAST_URL, c);
        return c;
      }
    }
    throw new Error("친구 서버에 연결하지 못했어요. 서버를 켜 둔 PC가 꺼져 있거나 잠시 재시작 중일 수 있어요.");
  })();
  // Retry on the next call after a failure
  resolving.catch(() => (resolving = null));
  return resolving;
}

/** Per-install key that proves "I'm the one who first shared this UID". Never leaves except to the friend server. */
export function installSecret(): string {
  let s = localStorage.getItem(KEY_SECRET);
  if (!s) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    s = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(KEY_SECRET, s);
  }
  return s;
}

export async function api<T>(path: string, init?: RequestInit & { secret?: boolean }): Promise<T> {
  const base = await serverBase();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init?.secret) headers["X-SRA-Secret"] = installSecret();
  let res: Response;
  try {
    res = await withTimeout(base + path, 15000, { ...init, headers });
  } catch {
    resolving = null; // the address may have changed; look it up again next time
    throw new Error("친구 서버 응답이 없어요. 잠시 후 다시 시도해 주세요.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((body as { error?: string }).error ?? `HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body as T;
}
