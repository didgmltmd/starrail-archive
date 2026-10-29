// End-game records from HoYoLAB: Memory of Chaos (moc), Pure Fiction (pf), Apocalyptic Shadow (as).
import type { ChallengeFloor, ChallengeKind, ChallengePeriod, ChallengeRecords, ChallengeTeam } from "../types";

export const CHALLENGE_KINDS: ChallengeKind[] = ["moc", "pf", "as"];

export const CHALLENGE_NAMES: Record<ChallengeKind, string> = {
  moc: "혼돈의 기억",
  pf: "허구 이야기",
  as: "종말의 환영",
};

interface HyTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}
interface HyAvatar {
  id: number | string;
  level: number;
  rank: number;
}
interface HyNode {
  avatars?: HyAvatar[];
  score?: string | number;
  boss_defeated?: boolean;
  buff?: { name_mi18n?: string; desc_mi18n?: string } | null;
}
interface HyFloor {
  name?: string;
  star_num?: number | string;
  round_num?: number;
  is_fast?: boolean;
  node_1?: HyNode | null;
  node_2?: HyNode | null;
  node_3?: HyNode | null;
}
interface HyGroup {
  name_mi18n?: string;
  status?: string;
  begin_time?: HyTime;
  end_time?: HyTime;
  upper_boss?: { name_mi18n?: string } | null;
  lower_boss?: { name_mi18n?: string } | null;
  tierce_boss?: { name_mi18n?: string } | null;
}
export interface HyChallenge {
  star_num?: number | string;
  max_floor?: string;
  battle_num?: number;
  has_data?: boolean;
  groups?: HyGroup[];
  all_floor_detail?: HyFloor[];
}

const clean = (s?: string) => (s ?? "").replace(/ /g, " ").trim();

function iso(t?: HyTime): string {
  if (!t?.year) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.year}-${pad(t.month)}-${pad(t.day)}T${pad(t.hour)}:${pad(t.minute)}:00`;
}

function team(n?: HyNode | null): ChallengeTeam | null {
  if (!n?.avatars?.length) return null;
  const score = n.score !== undefined && n.score !== "" ? Number(n.score) : undefined;
  return {
    avatars: n.avatars.map((a) => ({ id: String(a.id), level: a.level, eidolon: a.rank ?? 0 })),
    score: Number.isFinite(score) ? score : undefined,
    bossDefeated: n.boss_defeated,
    buff: n.buff?.name_mi18n ? { name: clean(n.buff.name_mi18n), desc: clean(n.buff.desc_mi18n) } : undefined,
  };
}

function floor(f: HyFloor): ChallengeFloor {
  return {
    // "취상 작문•4일반 모드" → "취상 작문•4" (the mode suffix is noise)
    name: clean(f.name).replace(/(일반|어려움|하드)\s*모드$/, "").trim(),
    stars: Number(f.star_num ?? 0) || 0,
    rounds: f.round_num || undefined,
    fast: !!f.is_fast,
    teams: [f.node_1, f.node_2, f.node_3].map(team).filter((t): t is ChallengeTeam => !!t),
  };
}

function period(kind: ChallengeKind, raw: HyChallenge | null | undefined, which: "current" | "previous"): ChallengePeriod | undefined {
  if (!raw) return undefined;
  const groups = raw.groups ?? [];
  // groups lists the open period first and the previous one after it
  const g = which === "current" ? groups[0] : (groups[1] ?? groups[0]);
  const floors = (raw.all_floor_detail ?? []).map(floor);
  return {
    kind,
    name: clean(g?.name_mi18n) || CHALLENGE_NAMES[kind],
    begin: iso(g?.begin_time),
    end: iso(g?.end_time),
    status: g?.status ?? "",
    stars: Number(raw.star_num ?? 0) || 0,
    battles: raw.battle_num ?? 0,
    maxFloor: clean(raw.max_floor),
    hasData: !!raw.has_data && floors.length > 0,
    floors,
    bosses: [g?.upper_boss, g?.lower_boss, g?.tierce_boss].map((b) => clean(b?.name_mi18n)).filter(Boolean),
  };
}

export function mapChallenges(raw?: Record<string, HyChallenge | null>): ChallengeRecords | undefined {
  if (!raw) return undefined;
  const out: ChallengeRecords = { current: {}, previous: {} };
  for (const kind of CHALLENGE_KINDS) {
    out.current[kind] = period(kind, raw[`${kind}_current`], "current");
    out.previous[kind] = period(kind, raw[`${kind}_previous`], "previous");
  }
  return out;
}

/** Days left until the period ends (rounded up), or null when unknown / over. */
export function daysLeft(p?: ChallengePeriod): number | null {
  if (!p?.end) return null;
  const ms = new Date(p.end).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86400000) : null;
}

/** Highest stars reachable (3 per floor): Memory of Chaos 10 floors, the others 4. */
export const MAX_STARS: Record<ChallengeKind, number> = { moc: 30, pf: 12, as: 12 };

export function maxStars(p: ChallengePeriod) {
  return Math.max(MAX_STARS[p.kind], p.stars);
}
