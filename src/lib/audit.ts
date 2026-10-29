// Relic scoring and per-character build check.
import { getBuild, type Build, type MainSlot } from "../data/builds";
import { game, SLOT_NAMES, SLOT_ORDER, STATS } from "../data/game";
import type { OwnedCharacter, Relic, RelicSlot, StatKey } from "../types";

/** Highest single roll of each sub stat on a 5-star relic. */
export const SUB_MAX: Partial<Record<StatKey, number>> = {
  HP: 42.34,
  ATK: 21.17,
  DEF: 21.17,
  HP_P: 0.0432,
  ATK_P: 0.0432,
  DEF_P: 0.054,
  SPD: 2.6,
  CR: 0.0324,
  CD: 0.0648,
  EHR: 0.0432,
  RES: 0.0432,
  BE: 0.0648,
};

const SUB_KEYS = Object.keys(SUB_MAX) as StatKey[];

/** Flat HP/ATK/DEF rolls are worth far less than % rolls. */
const FLAT_SCALE = 0.4;
const FLAT_OF: Partial<Record<StatKey, StatKey>> = { HP: "HP_P", ATK: "ATK_P", DEF: "DEF_P" };

const MAIN_SLOTS: MainSlot[] = ["BODY", "FOOT", "NECK", "OBJECT"];
const CAVERN: RelicSlot[] = ["HEAD", "HAND", "BODY", "FOOT"];
const PLANAR: RelicSlot[] = ["NECK", "OBJECT"];

export type Grade = "SSS" | "SS" | "S" | "A" | "B" | "C" | "D";

/** Percent of an ideal relic -> grade */
export function gradeOf(pct: number): Grade {
  if (pct >= 85) return "SSS";
  if (pct >= 72) return "SS";
  if (pct >= 60) return "S";
  if (pct >= 48) return "A";
  if (pct >= 36) return "B";
  if (pct >= 24) return "C";
  return "D";
}

/** Effective weight of a sub stat for this build (flat stats scaled down). */
export function subWeight(build: Build, key: StatKey): number {
  const pct = FLAT_OF[key];
  if (pct) {
    const own = build.weights[key] ?? 0;
    const viaPct = build.weights[pct] ?? 0;
    return Math.max(own, viaPct) * FLAT_SCALE;
  }
  return build.weights[key] ?? 0;
}

export interface SubScore {
  key: StatKey;
  weight: number;
  /** value expressed in max rolls (e.g. 2.7 = almost three perfect rolls) */
  rolls: number;
  score: number;
}

export interface RelicScore {
  /** Σ weight × rolls */
  score: number;
  /** Best achievable score for this slot and main stat */
  ideal: number;
  /** score / ideal, 0..100 */
  pct: number;
  grade: Grade;
  /** null when the slot has a fixed main stat (head / hands) or no recommendation */
  mainOk: boolean | null;
  subs: SubScore[];
}

/** Score of a perfect +15 5★ relic: best sub gets all 5 upgrades, next three get one roll each. */
function idealScore(build: Build, main: StatKey): number {
  const ws = SUB_KEYS.filter((k) => k !== main)
    .map((k) => subWeight(build, k))
    .sort((a, b) => b - a);
  return (ws[0] ?? 0) * 6 + (ws[1] ?? 0) + (ws[2] ?? 0) + (ws[3] ?? 0);
}

export function mainOkFor(build: Build, slot: RelicSlot, main: StatKey): boolean | null {
  if (!MAIN_SLOTS.includes(slot as MainSlot)) return null;
  const allowed = build.mains[slot as MainSlot];
  if (!allowed || allowed.length === 0) return null;
  return allowed.includes(main);
}

export function scoreRelic(relic: Relic, charId: string): RelicScore {
  const build = getBuild(charId);
  const subs: SubScore[] = relic.subs.map((s) => {
    const weight = subWeight(build, s.key);
    const rolls = s.value / (SUB_MAX[s.key] ?? 1);
    return { key: s.key, weight, rolls, score: weight * rolls };
  });
  const score = subs.reduce((a, s) => a + s.score, 0);
  const ideal = idealScore(build, relic.main.key) || 1;
  const pct = Math.min(100, (score / ideal) * 100);
  return { score, ideal, pct, grade: gradeOf(pct), mainOk: mainOkFor(build, relic.slot, relic.main.key), subs };
}

// ---------- Character audit ----------

export type Severity = "high" | "medium" | "low";

export interface Issue {
  severity: Severity;
  kind: "set" | "planar" | "main" | "sub" | "level" | "rarity" | "missing";
  slot?: RelicSlot;
  message: string;
}

export interface SlotAudit {
  slot: RelicSlot;
  relic?: Relic;
  score?: RelicScore;
  /** Recommended main stats ([] = any) */
  recommended: StatKey[];
  /** Slot contribution to the character score, 0..100 */
  pct: number;
}

export interface SetCheck {
  /** Sets currently worn in this group with piece counts */
  current: { setId: string; count: number }[];
  /** true = matches a recommendation, false = doesn't, null = no recommendation known */
  ok: boolean | null;
  /** Index of the matched recommendation (0 = best) */
  matchIndex: number;
}

export interface CharacterAudit {
  charId: string;
  build: Build;
  pct: number;
  grade: Grade;
  slots: Record<RelicSlot, SlotAudit>;
  cavern: SetCheck;
  planar: SetCheck;
  issues: Issue[];
}

function countSets(c: OwnedCharacter, slots: RelicSlot[]) {
  const m = new Map<string, number>();
  for (const r of c.relics) if (slots.includes(r.slot)) m.set(r.setId, (m.get(r.setId) ?? 0) + 1);
  return [...m.entries()].map(([setId, count]) => ({ setId, count })).sort((a, b) => b.count - a.count);
}

function cavernCheck(c: OwnedCharacter, build: Build): SetCheck {
  const current = countSets(c, CAVERN);
  const has = (id: string, n: number) => (current.find((s) => s.setId === id)?.count ?? 0) >= n;
  if (!build.relicSets.length) return { current, ok: null, matchIndex: -1 };
  const idx = build.relicSets.findIndex(([a, b]) => (a === b ? has(a, 4) : has(a, 2) && has(b, 2)));
  return { current, ok: idx >= 0, matchIndex: idx };
}

function planarCheck(c: OwnedCharacter, build: Build): SetCheck {
  const current = countSets(c, PLANAR);
  if (!build.ornamentSets.length) return { current, ok: null, matchIndex: -1 };
  const full = current.find((s) => s.count >= 2);
  const idx = full ? build.ornamentSets.indexOf(full.setId) : -1;
  return { current, ok: idx >= 0, matchIndex: idx };
}

export function setLabel(pair: [string, string]) {
  const [a, b] = pair;
  const n = (id: string) => game.relicSets[id]?.name ?? id;
  return a === b ? `${n(a)} 4세트` : `${n(a)} 2 + ${n(b)} 2`;
}

const statName = (k: StatKey) => STATS[k].name + (STATS[k].percent && ["HP_P", "ATK_P", "DEF_P"].includes(k) ? "%" : "");

export function auditCharacter(c: OwnedCharacter): CharacterAudit {
  const build = getBuild(c.id);
  const issues: Issue[] = [];
  const bySlot = new Map(c.relics.map((r) => [r.slot, r]));
  const slots = {} as Record<RelicSlot, SlotAudit>;

  for (const slot of SLOT_ORDER) {
    const relic = bySlot.get(slot);
    const recommended = (MAIN_SLOTS.includes(slot as MainSlot) ? build.mains[slot as MainSlot] : undefined) ?? [];
    if (!relic) {
      slots[slot] = { slot, recommended, pct: 0 };
      issues.push({ severity: "high", kind: "missing", slot, message: `${SLOT_NAMES[slot]} 성유물이 비어 있어요` });
      continue;
    }
    const score = scoreRelic(relic, c.id);
    let pct = score.pct;
    if (score.mainOk === false) {
      pct *= 0.4;
      issues.push({
        severity: "high",
        kind: "main",
        slot,
        message: `${SLOT_NAMES[slot]} 주옵션 ${statName(relic.main.key)} → ${recommended.map(statName).join(" / ")} 추천`,
      });
    }
    if (relic.rarity < 5) {
      issues.push({ severity: "medium", kind: "rarity", slot, message: `${SLOT_NAMES[slot]} 성유물 ${relic.rarity}성 → 5성으로 교체 추천` });
    } else if (relic.level < 15) {
      issues.push({ severity: "low", kind: "level", slot, message: `${SLOT_NAMES[slot]} 강화 +${relic.level} → +15까지 강화 추천` });
    }
    if (score.mainOk !== false && score.pct < 30) {
      issues.push({
        severity: "medium",
        kind: "sub",
        slot,
        message: `${SLOT_NAMES[slot]} 부옵션이 아쉬워요 (${score.grade})`,
      });
    }
    slots[slot] = { slot, relic, score, recommended, pct };
  }

  const cavern = cavernCheck(c, build);
  const planar = planarCheck(c, build);
  if (cavern.ok === false) {
    const cur = cavern.current.filter((s) => s.count >= 2);
    issues.push({
      severity: "high",
      kind: "set",
      message: `동굴 세트가 추천과 달라요${cur.length ? ` (현재 ${cur.map((s) => `${game.relicSets[s.setId]?.name} ${s.count}`).join(", ")})` : ""} → ${setLabel(build.relicSets[0])}`,
    });
  }
  if (planar.ok === false) {
    const name = game.relicSets[build.ornamentSets[0]]?.name;
    const broken = !planar.current.some((s) => s.count >= 2);
    issues.push({
      severity: broken ? "high" : "medium",
      kind: "planar",
      message: broken ? `차원장식 세트가 완성되지 않았어요 → ${name}` : `차원장식이 추천과 달라요 → ${name}`,
    });
  }

  let pct = SLOT_ORDER.reduce((a, s) => a + slots[s].pct, 0) / SLOT_ORDER.length;
  if (cavern.ok === false) pct *= 0.85;
  if (planar.ok === false) pct *= 0.92;

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return { charId: c.id, build, pct, grade: gradeOf(pct), slots, cavern, planar, issues };
}

/** Sub stats this build cares about, highest weight first (flat stats folded into their % stat). */
export function weightedStats(build: Build): { key: StatKey; weight: number }[] {
  return SUB_KEYS.filter((k) => !FLAT_OF[k])
    .map((k) => ({ key: k, weight: build.weights[k] ?? 0 }))
    .filter((x) => x.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

export { statName };
