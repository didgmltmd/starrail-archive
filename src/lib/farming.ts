// Farming recommendation: which Cavern / Planar domain helps the most characters right now.
import { game, SLOT_NAMES } from "../data/game";
import type { Account, OwnedCharacter, RelicSlot, StatKey } from "../types";
import { auditCharacter, type CharacterAudit } from "./audit";

export interface Domain {
  id: string;
  kind: "cavern" | "planar";
  sets: [string, string];
}

/** Each Cavern of Corrosion / Planar domain drops two sets. */
const CAVERN_PAIRS: [number, number][] = [
  [101, 102],
  [103, 106],
  [104, 110],
  [105, 111],
  [107, 109],
  [108, 112],
  [113, 114],
  [115, 116],
  [117, 118],
  [119, 120],
  [121, 122],
];

function buildDomains(): Domain[] {
  const exists = (n: number) => !!game.relicSets[String(n)];
  const out: Domain[] = [];
  const cavern = [...CAVERN_PAIRS];
  for (let a = 123; exists(a) || exists(a + 1); a += 2) cavern.push([a, a + 1]);
  for (const [a, b] of cavern) {
    if (exists(a) || exists(b)) out.push({ id: `c${a}`, kind: "cavern", sets: [String(a), String(b)] });
  }
  for (let a = 301; exists(a) || exists(a + 1); a += 2) {
    out.push({ id: `p${a}`, kind: "planar", sets: [String(a), String(a + 1)] });
  }
  return out;
}

export const DOMAINS = buildDomains();
const DOMAIN_OF = new Map<string, Domain>();
for (const d of DOMAINS) for (const s of d.sets) DOMAIN_OF.set(s, d);

export function domainOf(setId: string): Domain | undefined {
  return DOMAIN_OF.get(setId);
}

export type NeedReason = "set" | "main" | "low" | "missing" | "rarity";

export interface SlotNeed {
  slot: RelicSlot;
  reason: NeedReason;
  /** Main stats to aim for ([] = any) */
  targetMains: StatKey[];
  need: number;
}

export interface CharacterNeed {
  charId: string;
  /** Set to farm in this domain */
  setId: string;
  /** "4" = full 4-piece, "2" = 2-piece half of a 2+2, undefined = individual pieces */
  setPieces?: 2 | 4;
  slots: SlotNeed[];
  need: number;
}

export interface DomainRank {
  domain: Domain;
  need: number;
  characters: CharacterNeed[];
  /** Most wanted main stats per slot across characters */
  wanted: { slot: RelicSlot; key: StatKey; count: number }[];
}

const CAVERN: RelicSlot[] = ["HEAD", "HAND", "BODY", "FOOT"];
const PLANAR: RelicSlot[] = ["NECK", "OBJECT"];

export const REASON_LABEL: Record<NeedReason, string> = {
  set: "세트 교체",
  main: "주옵션 교체",
  low: "부옵션 개선",
  missing: "비어 있음",
  rarity: "5성 교체",
};

/** Characters still being raised count for less than finished ones. */
function priority(c: OwnedCharacter) {
  if (c.level >= 80) return 1;
  if (c.level >= 70) return 0.75;
  return 0.5;
}

function slotNeed(a: CharacterAudit, slot: RelicSlot): SlotNeed | undefined {
  const s = a.slots[slot];
  const targetMains = s.recommended;
  if (!s.relic) return { slot, reason: "missing", targetMains, need: 3 };
  if (s.score?.mainOk === false) return { slot, reason: "main", targetMains, need: 3 };
  if (s.relic.rarity < 5) return { slot, reason: "rarity", targetMains, need: 2.5 };
  const pct = s.score?.pct ?? 100;
  if (pct < 30) return { slot, reason: "low", targetMains, need: 2 };
  if (pct < 45) return { slot, reason: "low", targetMains, need: 1 };
  return undefined;
}

/** Splits one character's needs into per-domain entries. */
function needsFor(c: OwnedCharacter): { domain: Domain; entry: CharacterNeed }[] {
  const a = auditCharacter(c);
  const out: { domain: Domain; entry: CharacterNeed }[] = [];
  const w = priority(c);
  const bySlot = new Map(c.relics.map((r) => [r.slot, r]));

  const push = (setId: string, slots: SlotNeed[], setPieces?: 2 | 4) => {
    const domain = domainOf(setId);
    if (!domain || !slots.length) return;
    const need = slots.reduce((t, s) => t + s.need, 0) * w;
    out.push({ domain, entry: { charId: c.id, setId, setPieces, slots, need } });
  };

  // Cavern relics
  if (a.cavern.ok === false) {
    const [x, y] = a.build.relicSets[0];
    const all: SlotNeed[] = CAVERN.map((slot) => ({ slot, reason: "set", targetMains: a.slots[slot].recommended, need: 2 }));
    if (x === y) push(x, all, 4);
    else {
      push(x, all.slice(0, 2), 2);
      push(y, all.slice(2), 2);
    }
  } else {
    // Right set (or no recommendation): improve individual pieces from the set they belong to
    const groups = new Map<string, SlotNeed[]>();
    for (const slot of CAVERN) {
      const n = slotNeed(a, slot);
      if (!n) continue;
      const setId =
        bySlot.get(slot)?.setId ?? (a.cavern.matchIndex >= 0 ? a.build.relicSets[a.cavern.matchIndex][0] : undefined);
      if (!setId) continue;
      groups.set(setId, [...(groups.get(setId) ?? []), n]);
    }
    for (const [setId, slots] of groups) push(setId, slots);
  }

  // Planar ornaments
  if (a.planar.ok === false) {
    push(
      a.build.ornamentSets[0],
      PLANAR.map((slot) => ({ slot, reason: "set" as const, targetMains: a.slots[slot].recommended, need: 2 })),
      2,
    );
  } else {
    const groups = new Map<string, SlotNeed[]>();
    for (const slot of PLANAR) {
      const n = slotNeed(a, slot);
      if (!n) continue;
      const setId = bySlot.get(slot)?.setId ?? a.build.ornamentSets[0];
      if (!setId) continue;
      groups.set(setId, [...(groups.get(setId) ?? []), n]);
    }
    for (const [setId, slots] of groups) push(setId, slots);
  }

  return out;
}

export function rankDomains(account: Account): DomainRank[] {
  const map = new Map<string, DomainRank>();
  for (const c of account.characters) {
    for (const { domain, entry } of needsFor(c)) {
      const r = map.get(domain.id) ?? { domain, need: 0, characters: [], wanted: [] };
      r.need += entry.need;
      r.characters.push(entry);
      map.set(domain.id, r);
    }
  }

  for (const r of map.values()) {
    r.characters.sort((a, b) => b.need - a.need);
    const count = new Map<string, { slot: RelicSlot; key: StatKey; count: number }>();
    for (const ch of r.characters) {
      for (const s of ch.slots) {
        if (!["BODY", "FOOT", "NECK", "OBJECT"].includes(s.slot) || !s.targetMains[0]) continue;
        const key = s.targetMains[0];
        const k = `${s.slot}:${key}`;
        const cur = count.get(k) ?? { slot: s.slot, key, count: 0 };
        cur.count++;
        count.set(k, cur);
      }
    }
    r.wanted = [...count.values()].sort((a, b) => b.count - a.count);
  }

  return [...map.values()].sort((a, b) => b.need - a.need);
}

export function slotLabel(slot: RelicSlot) {
  return SLOT_NAMES[slot];
}
