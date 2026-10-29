// Warp history: fetched from the game's own history API with the key the game leaves in its web cache
// (see src-tauri/src/gacha.rs). Records are kept on this PC so history older than the API's
// 6-month window is never lost.
import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "./hoyolab";

export type BannerId = "char" | "lc" | "collabChar" | "collabLc" | "standard" | "departure";

export interface Banner {
  id: BannerId;
  label: string;
  short: string;
  gachaType: string;
  /** Official hard pity for a 5★ */
  hard: number;
  /** Has a featured 5★ (50/50 or 75/25) */
  event: boolean;
  /** Chance that a 5★ is the featured one (official) */
  featuredRate?: string;
  kind: "char" | "lc";
}

export const BANNERS: Banner[] = [
  { id: "char", label: "캐릭터 이벤트 워프", short: "캐릭터", gachaType: "11", hard: 90, event: true, featuredRate: "50:50", kind: "char" },
  { id: "lc", label: "광추 이벤트 워프", short: "광추", gachaType: "12", hard: 80, event: true, featuredRate: "75:25", kind: "lc" },
  { id: "collabChar", label: "콜라보 캐릭터 워프", short: "콜라보 캐릭터", gachaType: "21", hard: 90, event: true, featuredRate: "50:50", kind: "char" },
  { id: "collabLc", label: "콜라보 광추 워프", short: "콜라보 광추", gachaType: "22", hard: 80, event: true, featuredRate: "75:25", kind: "lc" },
  { id: "standard", label: "상주 워프", short: "상주", gachaType: "1", hard: 90, event: false, kind: "char" },
  { id: "departure", label: "초심자 워프", short: "초심자", gachaType: "2", hard: 50, event: false, kind: "char" },
];

export const JADE_PER_PULL = 160;

/** 5★ characters and light cones of the standard warp (what you get when losing a 50/50). */
const STANDARD_FIVE = new Set([
  "1003", "1004", "1101", "1104", "1107", "1209", "1211",
  "23000", "23002", "23003", "23004", "23005", "23012", "23013",
]);

export interface Pull {
  id: string;
  type: string;
  item: string;
  name: string;
  rank: number;
  time: string;
}

export interface WarpStore {
  uid: string;
  timeZone?: number;
  updatedAt: string;
  pulls: Pull[];
}

const KEY = (uid: string) => `sra.warps.${uid}`;
const LAST_UID = "sra.warps.uid";

const byId = (a: Pull, b: Pull) => (a.id.length - b.id.length) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function loadWarps(uid?: string): WarpStore | null {
  try {
    const u = uid ?? localStorage.getItem(LAST_UID);
    if (!u) return null;
    const raw = localStorage.getItem(KEY(u));
    return raw ? (JSON.parse(raw) as WarpStore) : null;
  } catch {
    return null;
  }
}

function saveWarps(s: WarpStore) {
  localStorage.setItem(KEY(s.uid), JSON.stringify(s));
  localStorage.setItem(LAST_UID, s.uid);
}

interface RawRecord {
  id: string;
  uid: string;
  gacha_type: string;
  item_id: string;
  name: string;
  rank_type: string;
  time: string;
}

function merge(store: WarpStore | null, uid: string, timeZone: number | undefined, records: RawRecord[]): WarpStore {
  const map = new Map((store?.uid === uid ? store.pulls : []).map((p) => [p.id, p]));
  for (const r of records) {
    map.set(r.id, {
      id: r.id,
      type: String(r.gacha_type),
      item: String(r.item_id),
      name: r.name,
      rank: Number(r.rank_type),
      time: r.time,
    });
  }
  return {
    uid,
    timeZone: timeZone ?? store?.timeZone,
    updatedAt: new Date().toISOString(),
    pulls: [...map.values()].sort(byId),
  };
}

// ---------- Analysis ----------

export interface FiveStar {
  pull: Pull;
  pity: number;
  /** Event warps only: won the 50/50, lost it, or was already guaranteed */
  result?: "won" | "lost" | "guaranteed";
}

export interface BannerStats {
  banner: Banner;
  total: number;
  pity5: number;
  pity4: number;
  guaranteed: boolean;
  fives: FiveStar[];
  fourCount: number;
  recentFours: Pull[];
  avgPity: number | null;
  won: number;
  lost: number;
}

export function standardPool(pulls: Pull[]) {
  const pool = new Set(STANDARD_FIVE);
  for (const p of pulls) if (p.rank === 5 && (p.type === "1" || p.type === "2")) pool.add(p.item);
  return pool;
}

export function analyze(banner: Banner, pulls: Pull[], pool: Set<string>): BannerStats {
  const list = pulls.filter((p) => p.type === banner.gachaType);
  let pity5 = 0;
  let pity4 = 0;
  let guaranteed = false;
  const fives: FiveStar[] = [];
  const fours: Pull[] = [];
  for (const p of list) {
    pity5++;
    pity4++;
    if (p.rank === 5) {
      let result: FiveStar["result"];
      if (banner.event) {
        const offBanner = pool.has(p.item);
        result = offBanner ? "lost" : guaranteed ? "guaranteed" : "won";
        guaranteed = offBanner;
      }
      fives.push({ pull: p, pity: pity5, result });
      pity5 = 0;
      pity4 = 0;
    } else if (p.rank === 4) {
      fours.push(p);
      pity4 = 0;
    }
  }
  const avg = fives.length ? fives.reduce((t, f) => t + f.pity, 0) / fives.length : null;
  return {
    banner,
    total: list.length,
    pity5,
    pity4,
    guaranteed,
    fives: fives.reverse(),
    fourCount: fours.length,
    recentFours: fours.slice(-12).reverse(),
    avgPity: avg,
    won: fives.filter((f) => f.result === "won").length,
    lost: fives.filter((f) => f.result === "lost").length,
  };
}

// ---------- Fetching ----------

export type WarpNotice = "NO_GAME" | "NO_URL" | "AUTHKEY_EXPIRED" | "AUTHKEY_INVALID" | "BAD_URL" | "NOT_DESKTOP";

export function describeNotice(n: WarpNotice): string {
  switch (n) {
    case "NO_GAME":
      return "이 PC에서 스타레일을 실행한 기록을 찾지 못했어요. 게임을 하는 PC에서 앱을 켜 주세요.";
    case "NO_URL":
      return "게임에서 워프 화면의 '기록'을 한 번 열면 자동으로 가져와요.";
    case "AUTHKEY_EXPIRED":
      return "기록 주소가 만료됐어요 (24시간). 게임에서 워프 '기록'을 다시 열면 자동으로 갱신돼요.";
    case "AUTHKEY_INVALID":
    case "BAD_URL":
      return "워프 기록 주소가 올바르지 않아요.";
    case "NOT_DESKTOP":
      return "워프 기록은 데스크톱 앱에서만 가져올 수 있어요.";
  }
}

const NOTICES = new Set(["NO_GAME", "NO_URL", "AUTHKEY_EXPIRED", "AUTHKEY_INVALID", "BAD_URL"]);

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

interface FetchResult {
  uid: string | null;
  timeZone: number | null;
  records: RawRecord[];
}

function sinceMap(store: WarpStore | null) {
  const since: Record<string, string> = {};
  for (const p of store?.pulls ?? []) since[p.type] = p.id; // pulls are sorted, so the last one wins
  return since;
}

const AUTO_EVERY_MS = 30 * 60 * 1000;
const MIN_GAP_MS = 2 * 60 * 1000;

export interface WarpState {
  data: WarpStore | null;
  busy: boolean;
  progress: string | null;
  notice: WarpNotice | null;
  error: string | null;
  /** Last time we looked (even if nothing was found) */
  checkedAt: number | null;
  sync: (opts?: { manualUrl?: string; quiet?: boolean }) => Promise<void>;
}

export function useWarps(): WarpState {
  const [data, setData] = useState<WarpStore | null>(() => loadWarps());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [notice, setNotice] = useState<WarpNotice | null>(isTauri ? null : "NOT_DESKTOP");
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const running = useRef(false);
  const lastRun = useRef(0);

  const sync = useCallback(async (opts?: { manualUrl?: string; quiet?: boolean }) => {
    if (!isTauri || running.current) return;
    if (opts?.quiet && Date.now() - lastRun.current < MIN_GAP_MS) return;
    running.current = true;
    lastRun.current = Date.now();
    setBusy(true);
    setError(null);
    const { listen } = await import("@tauri-apps/api/event");
    const names: Record<string, string> = Object.fromEntries(BANNERS.map((b) => [b.gachaType, b.short]));
    const stop = await listen<{ gachaType: string; page: number; count: number }>("gacha://progress", (e) =>
      setProgress(`${names[e.payload.gachaType] ?? ""} 워프 ${e.payload.page}쪽 · 새 기록 ${e.payload.count}개`),
    );
    try {
      let url = opts?.manualUrl?.trim();
      if (!url) {
        setProgress("게임 기록 주소를 찾는 중");
        url = (await invoke<{ url: string; cachedAt: number }>("gacha_find_url")).url;
      }
      const current = loadWarps();
      let res = await invoke<FetchResult>("gacha_fetch", { url, since: sinceMap(current) });
      // Another account: fetch everything instead of stopping at the other account's newest record
      if (res.uid && current && res.uid !== current.uid) {
        const other = loadWarps(res.uid);
        res = await invoke<FetchResult>("gacha_fetch", { url, since: sinceMap(other) });
      }
      const uid = res.uid ?? current?.uid;
      if (uid) {
        const next = merge(loadWarps(uid), uid, res.timeZone ?? undefined, res.records);
        saveWarps(next);
        setData(next);
      }
      setNotice(null);
    } catch (e) {
      const msg = String(e);
      if (NOTICES.has(msg)) setNotice(msg as WarpNotice);
      else setError(msg);
    } finally {
      stop();
      setProgress(null);
      setBusy(false);
      setCheckedAt(Date.now());
      running.current = false;
    }
  }, []);

  // Check at startup and every 30 minutes; the key is only valid for a day after opening the history in game.
  useEffect(() => {
    if (!isTauri) return;
    sync({ quiet: true });
    const t = setInterval(() => sync({ quiet: true }), AUTO_EVERY_MS);
    return () => clearInterval(t);
  }, [sync]);

  return { data, busy, progress, notice, error, checkedAt, sync };
}
