// Turn order simulator using the game's action gauge rules:
//  - every unit runs a 10000-long gauge at its SPD; acting resets it
//  - "advance X%" shortens the remaining gauge by 10000 × X
//  - SPD% buffs scale base SPD, flat buffs add to it
//  - in end-game modes the first cycle lasts 150 action value, every later cycle 100
// Kit effects come from data/speedkits.json (game text values).
import { game } from "../data/game";
import { speedKits, type SpeedEffect } from "../data/speedkits";
import type { OwnedCharacter } from "../types";
import { computeStats } from "./stats";

export const FIRST_CYCLE = 150;
export const CYCLE = 100;
const GAUGE = 10000;

export function cycleEnd(c: number) {
  return FIRST_CYCLE + CYCLE * c;
}
export function cycleOf(av: number) {
  if (av <= FIRST_CYCLE + 1e-9) return 0;
  return Math.ceil((av - FIRST_CYCLE - 1e-9) / CYCLE);
}

// ---------- Effects available to a character ----------

export interface Applied {
  id: string;
  source: "kit" | "lc" | "set";
  effect: SpeedEffect;
  value: number | number[];
}

function setPieces(c: OwnedCharacter) {
  const n = new Map<string, number>();
  for (const r of c.relics) n.set(r.setId, (n.get(r.setId) ?? 0) + 1);
  return n;
}

/** Kit, eidolon, light cone and relic set effects that apply to this character as built. */
export function availableEffects(c: OwnedCharacter, finalSpd: number): Applied[] {
  const out: Applied[] = [];
  const path = game.characters[c.id]?.path;
  (speedKits.characters[c.id] ?? []).forEach((e, i) => {
    if (e.rank && c.eidolon < e.rank) return;
    out.push({ id: `kit:${c.id}:${i}`, source: "kit", effect: e, value: e.value });
  });
  if (c.lightCone) {
    const s = Math.max(1, Math.min(5, c.lightCone.superimposition || 1));
    (speedKits.lightCones[c.lightCone.id] ?? []).forEach((e, i) => {
      const v = Array.isArray(e.value) ? e.value[s - 1] : e.value;
      out.push({ id: `lc:${c.lightCone!.id}:${i}`, source: "lc", effect: e, value: v });
    });
  }
  const pieces = setPieces(c);
  for (const [setId, n] of pieces) {
    (speedKits.relicSets[setId] ?? []).forEach((e, i) => {
      if (e.pieces && n < e.pieces) return;
      if (e.minSpd && finalSpd < e.minSpd) return;
      if (e.path && e.path !== path) return;
      out.push({ id: `set:${setId}:${i}`, source: "set", effect: e, value: e.value });
    });
  }
  return out;
}

export function baseSpd(c: OwnedCharacter) {
  return computeStats(c).find((l) => l.key === "SPD")?.base ?? game.characters[c.id]?.base?.spd ?? 100;
}

/** Energy regeneration as a multiplier (1.194 = +19.4%). */
export function errOf(c: OwnedCharacter) {
  const line = computeStats(c).find((l) => l.key === "ERR");
  const v = line ? line.base + line.bonus : 1;
  return v < 0.5 ? v + 1 : v;
}

/**
 * Rough ultimate timing from energy: battles start at 50% energy, a skill gives 30, a basic 20,
 * an ultimate refunds 5, all scaled by energy regeneration. Energy from talents, hits taken or
 * allies is not counted, so this is the slow end.
 */
export function ultEstimate(c: OwnedCharacter, skillEvery: number) {
  const max = game.characters[c.id]?.energy ?? 120;
  const err = errOf(c);
  const per = (skillEvery > 0 ? (30 + 20 * (skillEvery - 1)) / skillEvery : 20) * err;
  const first = Math.max(1, Math.ceil((max * 0.5) / per));
  const every = Math.max(1, Math.ceil((max - 5 * err) / per));
  return { first, every };
}

// ---------- Simulation ----------

export interface UnitSetup {
  key: string;
  path: string;
  base: number;
  /** Final SPD (HoYoLAB) plus the manual bonus */
  spd: number;
  /** Use the skill every N turns (1 = every turn, 0 = never) */
  skillEvery: number;
  ultFirst: number;
  /** Ultimate every N turns (0 = never) */
  ultEvery: number;
  target?: string;
  effects: Applied[];
}

export interface SimEvent {
  key: string;
  av: number;
  cycle: number;
  /** Turn number of the unit */
  n: number;
  type: "skill" | "basic";
  ult: boolean;
  spd: number;
  /** Robin-style countdown ended right before this turn */
  afterCountdown?: boolean;
}

interface Buff {
  id: string;
  pct: number;
  flat: number;
  left: number;
  on: "target" | "owner";
  owner: string;
  fresh: boolean;
}

interface State {
  s: UnitSetup;
  slot: number;
  d: number;
  turns: number;
  buffs: Buff[];
  pending: Buff[];
  next: number;
  countdown: number | null;
  nextUlt: number;
  used: Set<string>;
}

const spdOf = (u: State) => {
  if (u.countdown !== null) return u.countdown;
  let pct = 0;
  let flat = 0;
  for (const b of u.buffs) {
    pct += b.pct;
    flat += b.flat;
  }
  return Math.max(1, u.s.spd + u.s.base * pct + flat);
};

export function simulate(units: UnitSetup[], cycles: number): SimEvent[] {
  const end = cycleEnd(cycles - 1);
  const us: State[] = units.map((s, slot) => ({
    s,
    slot,
    d: GAUGE,
    turns: 0,
    buffs: [],
    pending: [],
    next: 0,
    countdown: null,
    nextUlt: s.ultEvery > 0 ? s.ultFirst : Infinity,
    used: new Set(),
  }));
  const byKey = new Map(us.map((u) => [u.s.key, u]));
  const elation = us.filter((u) => u.s.path === "Elation").length;
  let actor: State | null = null;

  const targets = (owner: State, to: SpeedEffect["to"]): State[] => {
    if (to === "self") return [owner];
    if (to === "team") return us;
    if (to === "others") return us.filter((u) => u !== owner);
    if (to === "ally") {
      const t = owner.s.target ? byKey.get(owner.s.target) : undefined;
      return t && t !== owner ? [t] : [];
    }
    const path = to.slice(5);
    return us.filter((u) => u.s.path === path);
  };

  const apply = (owner: State, a: Applied) => {
    const e = a.effect;
    if (e.once) {
      if (owner.used.has(a.id)) return;
      owner.used.add(a.id);
    }
    const v = typeof a.value === "number" ? a.value : a.value[0];
    for (const t of targets(owner, e.to)) {
      if (e.notPath && t.s.path === e.notPath) continue;
      switch (e.kind) {
        case "advance":
          t.d = Math.max(0, t.d - GAUGE * v);
          break;
        case "advanceByElation": {
          const arr = Array.isArray(a.value) ? a.value : [a.value];
          if (elation > 0) t.d = Math.max(0, t.d - GAUGE * arr[Math.min(elation, arr.length) - 1]);
          break;
        }
        case "nextAdvance":
          owner.next = Math.max(owner.next, v);
          break;
        case "countdown":
          owner.countdown = v;
          owner.d = GAUGE;
          break;
        default: {
          const buff: Buff = {
            id: `${a.id}>${owner.s.key}`,
            pct: e.kind === "spdPct" ? v : 0,
            flat: e.kind === "spdFlat" ? v : e.kind === "spdOfCaster" ? v * spdOf(owner) : 0,
            left: e.dur ?? Infinity,
            on: e.durOn ?? "target",
            owner: owner.s.key,
            // A buff gained during the holder's own turn does not count that turn
            fresh: (e.durOn ?? "target") === "target" && t === actor,
          };
          const list = e.after ? t.pending : t.buffs;
          const i = list.findIndex((b) => b.id === buff.id);
          if (i >= 0) list[i] = buff;
          else list.push(buff);
        }
      }
    }
  };
  const fire = (u: State, on: SpeedEffect["on"]) => {
    for (const a of u.s.effects) if (a.effect.on === on) apply(u, a);
  };

  for (const u of us) fire(u, "passive");
  for (const u of us) fire(u, "start");

  const events: SimEvent[] = [];
  let t = 0;
  for (let guard = 0; guard < 3000; guard++) {
    let u = us[0];
    let best = Infinity;
    for (const v of us) {
      const w = v.d / spdOf(v);
      if (w < best - 1e-9) {
        best = w;
        u = v;
      }
    }
    if (!us.length || t + best > end + 1e-9) break;
    const speeds = us.map(spdOf);
    us.forEach((v, i) => (v.d = Math.max(0, v.d - speeds[i] * best)));
    u.d = 0;
    t += best;
    actor = u;

    let afterCountdown = false;
    if (u.countdown !== null) {
      u.countdown = null;
      afterCountdown = true;
    }
    // Buffs that count down on the caster's turns
    for (const v of us) {
      for (const b of v.buffs) if (b.on === "owner" && b.owner === u.s.key) b.left--;
      v.buffs = v.buffs.filter((b) => b.left > 0);
    }

    u.turns++;
    const type = u.s.skillEvery > 0 && (u.turns - 1) % u.s.skillEvery === 0 ? "skill" : "basic";
    const ev: SimEvent = { key: u.s.key, av: t, cycle: cycleOf(t), n: u.turns, type, ult: false, spd: spdOf(u), afterCountdown };
    events.push(ev);
    fire(u, type);

    // Buffs on the actor that count its own turns
    for (const b of u.buffs) {
      if (b.on !== "target") continue;
      if (b.fresh) b.fresh = false;
      else b.left--;
    }
    u.buffs = u.buffs.filter((b) => b.left > 0);
    for (const b of u.pending) {
      const i = u.buffs.findIndex((x) => x.id === b.id);
      if (i >= 0) u.buffs[i] = b;
      else u.buffs.push(b);
    }
    u.pending = [];

    u.d = GAUGE * (1 - u.next);
    u.next = 0;
    if (u.turns >= u.nextUlt) {
      ev.ult = true;
      u.nextUlt += u.s.ultEvery;
      fire(u, "ult");
    }
    actor = null;
  }
  return events;
}

/** Actions of one unit per cycle. */
export function perCycle(events: SimEvent[], key: string, cycles: number) {
  const counts = Array.from({ length: cycles }, () => 0);
  for (const e of events) if (e.key === key && e.cycle < cycles) counts[e.cycle]++;
  return counts;
}

/** Smallest extra SPD that gives this unit one more action in the shown cycles (with all effects). */
export function nextBreakpoint(units: UnitSetup[], key: string, cycles: number) {
  const count = (list: UnitSetup[]) => simulate(list, cycles).filter((e) => e.key === key).length;
  const have = count(units);
  for (let step = 1; step <= 600; step++) {
    const extra = step / 10;
    const list = units.map((u) => (u.key === key ? { ...u, spd: u.spd + extra } : u));
    if (count(list) > have) return { extra, actions: have + 1 };
  }
  return null;
}

/** Well-known breakpoints for the first cycles (no buffs), for the reference table. */
const spdFor = (actions: number, cycle: number) => (actions * GAUGE) / cycleEnd(cycle);
export const BREAKPOINTS = [
  { spd: spdFor(2, 0), label: "0사이클 2회 행동" },
  { spd: spdFor(3, 1), label: "1사이클까지 3회 행동" },
  { spd: spdFor(4, 1), label: "1사이클까지 4회 행동" },
  { spd: spdFor(5, 2), label: "2사이클까지 5회 행동" },
  { spd: spdFor(6, 2), label: "2사이클까지 6회 행동" },
];
