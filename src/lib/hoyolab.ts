// HoYoLAB link: talks to the Rust side (src-tauri/src/hoyolab.rs) and maps
// HoYoLAB's Star Rail character JSON into the app's Account shape.
import type { Account, OwnedCharacter, Relic, RelicSlot, StatKey, StatLine, SubStat } from "../types";
import { mapChallenges, type HyChallenge } from "./challenges";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export async function linkStatus(): Promise<string | null> {
  if (!isTauri) return null;
  return (await invoke<string | null>("hoyolab_status")) ?? null;
}

export function openLogin() {
  return invoke<void>("hoyolab_login");
}

export function logout() {
  return invoke<void>("hoyolab_logout");
}

/** Listens for the login window result. Returns an unsubscribe function. */
export async function onLoginEvents(handlers: {
  linked: (ltuid: string) => void;
  closed: () => void;
  error: (msg: string) => void;
}) {
  const { listen } = await import("@tauri-apps/api/event");
  const offs = await Promise.all([
    listen<string>("hoyolab://linked", (e) => handlers.linked(e.payload)),
    listen("hoyolab://login-closed", () => handlers.closed()),
    listen<string>("hoyolab://error", (e) => handlers.error(e.payload)),
  ]);
  return () => offs.forEach((off) => off());
}

/** Error from the Rust side, with a machine-readable code when there is one. */
export function describeError(e: unknown): { code?: string; message: string } {
  const raw = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
  const m = /^([A-Z0-9_]+): (.*)$/s.exec(raw);
  return m ? { code: m[1], message: m[2] } : { message: raw };
}

// ---------------------------------------------------------------------------
// Mapping

interface PropertyInfo {
  property_type: number;
  name?: string;
  property_name_relic?: string;
  property_name_filter?: string;
}
interface HyRelicProp {
  property_type: number;
  value: string;
  times?: number;
}
interface HyRelic {
  id: number | string;
  level: number;
  pos: number;
  rarity: number;
  main_property: HyRelicProp;
  properties: HyRelicProp[];
}
interface HyAvatar {
  id: number | string;
  level: number;
  rank: number;
  equip?: { id: number | string; level: number; rank: number } | null;
  relics?: HyRelic[];
  ornaments?: HyRelic[];
  properties?: { property_type: number; base: string; add: string; final: string }[];
}
export interface SyncPayload {
  role: { game_uid: string; nickname: string; level: number; region: string };
  avatars: { avatar_list: HyAvatar[]; property_info?: Record<string, PropertyInfo> };
  index?: { cur_head_icon_url?: string } | null;
  challenges?: Record<string, HyChallenge | null>;
}

const ELEMENT_WORDS: [string, StatKey][] = [
  ["physical", "Physical_DMG"],
  ["fire", "Fire_DMG"],
  ["ice", "Ice_DMG"],
  ["lightning", "Thunder_DMG"],
  ["thunder", "Thunder_DMG"],
  ["wind", "Wind_DMG"],
  ["quantum", "Quantum_DMG"],
  ["imaginary", "Imaginary_DMG"],
];

/** Stat key from an English HoYoLAB property name; `percent` tells HP from HP% etc. */
export function keyFromName(name: string, percent: boolean): StatKey | undefined {
  const n = name.toLowerCase();
  if (n.includes("crit rate")) return "CR";
  if (n.includes("crit dmg")) return "CD";
  if (n.includes("break")) return "BE";
  if (n.includes("healing")) return "OHB";
  if (n.includes("energy")) return n.includes("regen") ? "ERR" : undefined;
  if (n.includes("effect hit")) return "EHR";
  if (n.includes("effect res")) return "RES";
  if (n.includes("dmg")) return ELEMENT_WORDS.find(([w]) => n.includes(w))?.[1];
  if (n.includes("spd") || n.includes("speed")) return "SPD";
  if (/\bhp\b/.test(n)) return percent || n.includes("%") ? "HP_P" : "HP";
  if (n.includes("atk") || n.includes("attack")) return percent || n.includes("%") ? "ATK_P" : "ATK";
  if (n.includes("def")) return percent || n.includes("%") ? "DEF_P" : "DEF";
  return undefined;
}

// Used only when HoYoLAB does not send property_info. Names from property_info win.
const FALLBACK_TYPES: Record<number, string> = {
  1: "HP", 2: "ATK", 3: "DEF", 4: "SPD", 5: "CRIT Rate", 6: "CRIT DMG", 7: "Outgoing Healing Boost",
  9: "Energy Regeneration Rate", 10: "Effect Hit Rate", 11: "Effect RES", 12: "Physical DMG Boost",
  14: "Fire DMG Boost", 16: "Ice DMG Boost", 18: "Lightning DMG Boost", 20: "Wind DMG Boost",
  22: "Quantum DMG Boost", 24: "Imaginary DMG Boost", 27: "HP", 29: "ATK", 31: "DEF", 32: "HP%",
  33: "ATK%", 34: "DEF%", 51: "SPD", 52: "CRIT Rate", 53: "CRIT DMG", 54: "Energy Regeneration Rate",
  55: "Outgoing Healing Boost", 56: "Effect Hit Rate", 57: "Effect RES", 58: "Break Effect", 59: "Break Effect",
};

/** "43.2%" → 0.432, "+1,234" → 1234 */
export function parseValue(v: string | number | undefined): { value: number; percent: boolean } {
  const s = String(v ?? "0").trim();
  const percent = s.endsWith("%");
  const num = parseFloat(s.replace(/[+,%\s]/g, "")) || 0;
  return { value: percent ? num / 100 : num, percent };
}

const POS: Record<number, RelicSlot> = { 1: "HEAD", 2: "HAND", 3: "BODY", 4: "FOOT", 5: "NECK", 6: "OBJECT" };
const STAT_ORDER: StatKey[] = ["HP", "ATK", "DEF", "SPD", "CR", "CD", "BE", "OHB", "ERR", "EHR", "RES"];

export function mapAccount(p: SyncPayload): { account: Account; unknownTypes: number[] } {
  const info = p.avatars.property_info ?? {};
  const unknown = new Set<number>();
  const nameOf = (t: number) => {
    const i = info[String(t)];
    return i?.property_name_relic || i?.name || i?.property_name_filter || FALLBACK_TYPES[t] || "";
  };
  const resolve = (t: number, raw: string | number | undefined) => {
    const { value, percent } = parseValue(raw);
    const key = keyFromName(nameOf(t), percent);
    if (!key) unknown.add(t);
    return key ? { key, value } : undefined;
  };

  const mapRelic = (r: HyRelic): Relic | undefined => {
    const slot = POS[r.pos];
    const id = String(r.id);
    const main = resolve(r.main_property.property_type, r.main_property.value);
    if (!slot || !main) return undefined;
    const subs: SubStat[] = [];
    for (const s of r.properties ?? []) {
      const x = resolve(s.property_type, s.value);
      if (x) subs.push({ ...x, rolls: s.times ?? 1 });
    }
    return {
      setId: id.length === 5 ? id.slice(1, 4) : id,
      slot,
      rarity: r.rarity,
      level: r.level,
      main,
      subs,
    };
  };

  const characters: OwnedCharacter[] = (p.avatars.avatar_list ?? []).map((a) => {
    const finalStats: StatLine[] = [];
    for (const prop of a.properties ?? []) {
      const base = resolve(prop.property_type, prop.base);
      const add = parseValue(prop.add);
      const fin = parseValue(prop.final);
      if (!base) continue;
      // Some stats only come with a final value; treat it all as base then.
      const baseVal = prop.base ? base.value : fin.value;
      finalStats.push({ key: base.key, base: baseVal, bonus: prop.base ? add.value : 0 });
    }
    finalStats.sort((x, y) => rank(x.key) - rank(y.key));
    return {
      id: String(a.id),
      level: a.level,
      eidolon: a.rank ?? 0,
      lightCone: a.equip ? { id: String(a.equip.id), level: a.equip.level, superimposition: a.equip.rank } : undefined,
      relics: [...(a.relics ?? []), ...(a.ornaments ?? [])].map(mapRelic).filter((r): r is Relic => !!r),
      finalStats: finalStats.length ? finalStats : undefined,
    };
  });

  const headId = /(\d{4})\.png/.exec(p.index?.cur_head_icon_url ?? "")?.[1];
  return {
    account: {
      uid: p.role.game_uid,
      nickname: p.role.nickname,
      level: p.role.level,
      avatarId: headId && characters.some((c) => c.id === headId) ? headId : (characters[0]?.id ?? "8001"),
      signature: "",
      characters,
      updatedAt: new Date().toISOString(),
      source: "hoyolab",
      challenges: mapChallenges(p.challenges),
    },
    unknownTypes: [...unknown],
  };
}

function rank(k: StatKey) {
  const i = STAT_ORDER.indexOf(k);
  return i === -1 ? 99 : i;
}

export async function fetchAccount(uid?: string) {
  const payload = await invoke<SyncPayload>("hoyolab_fetch", { uid: uid ?? null });
  return mapAccount(payload);
}

// ---------------------------------------------------------------------------
// Local cache

const CACHE_KEY = "sra.account";

export function loadCachedAccount(): Account | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

export function saveCachedAccount(a: Account | null) {
  try {
    if (a) localStorage.setItem(CACHE_KEY, JSON.stringify(a));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // storage unavailable; the app still works for this session
  }
}

/** Auto sync when the cached data is older than this. */
export const AUTO_SYNC_AFTER_MS = 30 * 60 * 1000;
/** While the app stays open, sync this often. */
export const SYNC_INTERVAL_MS = 60 * 60 * 1000;

export function timeAgo(iso?: string) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "방금 전";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}
