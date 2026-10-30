// Battle simulator: action gauge, energy, skill points, toughness, Elation (Aha) and damage.
// Character behaviour comes from data (dmgkits.json + speedkits.json), numbers from the game
// data (skills.json) and the account's real stats, skill levels, traces, eidolons and gear.
//
// Simplifications (shown in the UI): enemies do not attack (no energy from hits, no HP),
// expected values are used for crits and chances, every enemy is identical.
import { game } from "../../data/game";
import { dmgKits, type CharKit, type Cond, type DmgType, type Hit, type KitAction, type KitEffect, type KitState, type Value } from "../../data/dmgkits";
import { skillData } from "../../data/skills";
import { speedKits, type SpeedEffect } from "../../data/speedkits";
import type { ElementId, OwnedCharacter, StatKey } from "../../types";
import { computeStats } from "../stats";
import { BREAK_FACTOR, breakLevelMult, CYCLE, elationLevelMult, FIRST_CYCLE, GAUGE, MAX_SP, START_SP } from "./constants";

// ---------- Setup types ----------

export interface EnemySetup {
  level: number;
  count: number;
  toughness: number;
  spd: number;
  /** RES for elements the enemy is not weak to */
  res: number;
  /** Weak elements; "all" makes every element a weakness */
  weak: ElementId[] | "all";
}

export interface MemberSetup {
  char: OwnedCharacter;
  /** Skill every N turns (1 = every turn, 0 = never), null = the kit's preference */
  skillEvery: number | null;
  /** null = when energy is full, 0 = never, N = every N turns */
  ult: number | null;
  /** Chosen ally for single-target effects */
  target?: string;
  /** Effect source ids turned off */
  off: string[];
  extraSpd: number;
}

export function cycleEnd(c: number) {
  return FIRST_CYCLE + CYCLE * c;
}
export function cycleOf(av: number) {
  if (av <= FIRST_CYCLE + 1e-9) return 0;
  return Math.ceil((av - FIRST_CYCLE - 1e-9) / CYCLE);
}

// ---------- Effect sources ----------

export interface Source {
  id: string;
  from: "kit" | "lc" | "set" | "speed";
  eff: KitEffect;
  /** Turned on (not in the player's off list) */
  on: boolean;
  /** Effect of a state: its buffs end with the state */
  state?: string;
}

function speedToKit(e: SpeedEffect): KitEffect | null {
  const base = { on: e.on, to: e.to, dur: e.dur, durOn: e.durOn, after: e.after, note: e.note } as KitEffect;
  if (e.once) base.limit = { total: 1 };
  if (e.notPath) base.cond = { notPath: e.notPath };
  const v = e.value;
  switch (e.kind) {
    case "advance":
      return { ...base, do: "advance", value: v as number };
    case "nextAdvance":
      return { ...base, do: "nextAdvance", value: v as number };
    case "countdown":
      return { ...base, do: "countdown", value: v as number };
    case "spdPct":
      return { ...base, stat: "SPD%", value: v as number };
    case "spdFlat":
      return { ...base, stat: "SPD", value: v as number };
    case "spdOfCaster":
      return { ...base, stat: "SPD", value: { mul: [v as number, { stat: "SPD", of: "owner" }] } };
    case "advanceByElation":
      return { ...base, do: "advance", value: { pick: v as number[], by: { count: "path:Elation" } } };
    case "ahaExtraTurn":
      return { ...base, do: "ahaExtraTurn", value: v as number };
    case "ahaSpdPerAllyAttack":
      return { ...base, on: "allyAttack", do: "ahaSpd", value: v as number, cond: { count: { of: "path:Elation", lte: 1 } } };
    default:
      return null;
  }
}

/** Damage kit of a character; "<id>:e" holds the enhanced (reworked) version. */
export function kitOf(c: OwnedCharacter): CharKit | undefined {
  return (c.enhanced && dmgKits.characters[`${c.id}:e`]) || dmgKits.characters[c.id];
}

function setPieces(c: OwnedCharacter) {
  const n = new Map<string, number>();
  for (const r of c.relics) n.set(r.setId, (n.get(r.setId) ?? 0) + 1);
  return n;
}

const statCache = new WeakMap<OwnedCharacter, ReturnType<typeof computeStats>>();
function statsOf(c: OwnedCharacter) {
  let s = statCache.get(c);
  if (!s) {
    s = computeStats(c);
    statCache.set(c, s);
  }
  return s;
}

function sheetValue(c: OwnedCharacter, key: StatKey) {
  const l = statsOf(c).find((x) => x.key === key);
  return l ? l.base + l.bonus : 0;
}

/** Every effect that applies to this character as built (eidolon, traces, light cone, relic sets). */
export function sourcesFor(c: OwnedCharacter, off: string[] = []): Source[] {
  const out: Source[] = [];
  const traces = c.traces ? new Set(c.traces) : null;
  const ok = (e: KitEffect) =>
    !(e.rank && c.eidolon < e.rank) && !(e.maxRank && c.eidolon >= e.maxRank) && !(e.trace && traces && !traces.has(e.trace));
  const push = (id: string, from: Source["from"], eff: KitEffect) => out.push({ id, from, eff, on: !off.includes(id) });

  const hasKit = !!kitOf(c);
  (speedKits.characters[c.id] ?? []).forEach((e, i) => {
    if (e.rank && c.eidolon < e.rank) return;
    // Damage kits carry the full version (fixed Punchline amount)
    if (hasKit && e.kind === "ahaExtraTurn") return;
    const k = speedToKit(e);
    if (k) push(`kit:${c.id}:${i}`, "speed", k);
  });
  (kitOf(c)?.effects ?? []).forEach((e, i) => ok(e) && push(`dk:${c.id}:${i}`, "kit", e));

  if (c.lightCone) {
    const lc = c.lightCone.id;
    const s = Math.max(1, Math.min(5, c.lightCone.superimposition || 1));
    (speedKits.lightCones[lc] ?? []).forEach((e, i) => {
      const k = speedToKit({ ...e, value: Array.isArray(e.value) && e.kind !== "advanceByElation" ? e.value[s - 1] : e.value });
      if (k) push(`lc:${lc}:${i}`, "speed", k);
    });
    (dmgKits.lightCones[lc]?.effects ?? []).forEach((e, i) => push(`dlc:${lc}:${i}`, "lc", e));
  }

  const pieces = setPieces(c);
  const spd = sheetValue(c, "SPD");
  const path = game.characters[c.id]?.path;
  for (const [setId, n] of pieces) {
    (speedKits.relicSets[setId] ?? []).forEach((e, i) => {
      if ((e.pieces && n < e.pieces) || (e.minSpd && spd < e.minSpd) || (e.path && e.path !== path)) return;
      const k = speedToKit(e);
      if (k) push(`set:${setId}:${i}`, "speed", k);
    });
    (dmgKits.relicSets[setId]?.effects ?? []).forEach((e, i) => {
      if (e.pieces && n < e.pieces) return;
      push(`dset:${setId}:${i}`, "set", e);
    });
  }
  return out;
}

// ---------- Runtime types ----------

interface Buff {
  id: string;
  src: Source;
  owner: U;
  holder: U;
  stacks: number;
  left: number;
  durOn: "target" | "owner";
  fresh: boolean;
  /** Created by a state; removed when it ends */
  state?: string;
  /** Action sequence number when gained (consumed buffs skip the action that granted them) */
  seq: number;
}

interface Dot {
  owner: U;
  mult: number;
  scale: "ATK" | "HP" | "DEF";
  element: ElementId;
  left: number;
  /** Break DoT: fixed base damage, break formula */
  breakBase?: number;
  label: string;
  id?: string;
}

interface U {
  key: string;
  kind: "char" | "summon" | "aha" | "enemy";
  slot: number;
  name: string;
  c?: OwnedCharacter;
  kit?: CharKit;
  owner?: U;
  level: number;
  element?: ElementId;
  path?: string;
  cfg?: MemberSetup;
  sources: Source[];
  d: number;
  turns: number;
  next: number;
  countdown: number | null;
  buffs: Buff[];
  pending: Buff[];
  counters: Record<string, number>;
  states: { def: KitState; uses: number; left: number; fresh: boolean }[];
  energy: number;
  maxEnergy: number;
  banger: { v: number; left: number } | null;
  fired: Map<string, number>;
  firedTurn: Map<string, number>;
  ultTurn: number;
  active: boolean;
  // summons
  summonAction?: string;
  summonSpd?: Value;
  // enemies
  toughness: number;
  maxToughness: number;
  broken: boolean;
  dots: Dot[];
  ahaBonus: number;
}

export interface TurnEvent {
  key: string;
  owner?: string;
  name: string;
  kind: U["kind"];
  av: number;
  cycle: number;
  n: number;
  action: string;
  type: string;
  ult: boolean;
  extra: boolean;
  spd: number;
  sp: number;
  damage: number;
  afterCountdown?: boolean;
  /** Battle state right before this action (for the playback view) */
  snap?: Snapshot;
  /** Index of the first damage event dealt from this turn on */
  dmgStart: number;
}

export interface UnitSnap {
  key: string;
  name: string;
  kind: U["kind"];
  /** Action value left until this unit's next turn */
  wait: number;
  spd: number;
  energy?: number;
  maxEnergy?: number;
  buffs: { note: string; left: number; stacks: number; debuff: boolean }[];
  states: string[];
  toughness?: number;
  maxToughness?: number;
  broken?: boolean;
  banger?: number;
  dots?: number;
}

export interface Snapshot {
  units: UnitSnap[];
  sp: number;
  punch: number;
}

export interface DamageEvent {
  av: number;
  /** Character credited (summons credit their owner) */
  key: string;
  by: string;
  action: string;
  type: DmgType;
  amount: number;
  /** Expected crit multiplier etc. for the first target, for the breakdown view */
  parts?: Record<string, number>;
}

export interface BattleResult {
  turns: TurnEvent[];
  damage: DamageEvent[];
  end: number;
  sources: Record<string, Source[]>;
  /** Kits missing for these characters (speed only) */
  noKit: string[];
  log: string[];
}

// ---------- Simulator ----------

export function simulateBattle(members: MemberSetup[], enemy: EnemySetup, cycles: number): BattleResult {
  const end = cycleEnd(cycles - 1);
  const turns: TurnEvent[] = [];
  const damage: DamageEvent[] = [];
  const log: string[] = [];
  let t = 0;
  let sp = START_SP;
  let spMax = MAX_SP;
  let punch = 0;
  /** Punchline override while an Aha Instant resolves */
  let ahaPunch: number | null = null;
  /** Owner of the Aha extra turn being resolved */
  let ahaExtraBy: U | null = null;
  let current: TurnEvent | null = null;

  const blank = (key: string, kind: U["kind"], slot: number, name: string): U => ({
    key,
    kind,
    slot,
    name,
    level: 80,
    sources: [],
    d: GAUGE,
    turns: 0,
    next: 0,
    countdown: null,
    buffs: [],
    pending: [],
    counters: {},
    states: [],
    energy: 0,
    maxEnergy: 0,
    banger: null,
    fired: new Map(),
    firedTurn: new Map(),
    ultTurn: 0,
    active: true,
    toughness: 0,
    maxToughness: 0,
    broken: false,
    dots: [],
    ahaBonus: 0,
  });

  // Party
  const chars: U[] = members.map((m, slot) => {
    const c = m.char;
    const info = game.characters[c.id];
    const u = blank(c.id, "char", slot, info?.name ?? c.id);
    u.c = c;
    u.cfg = m;
    u.kit = kitOf(c);
    u.level = c.level || 80;
    u.element = info?.element as ElementId;
    u.path = info?.path;
    u.sources = sourcesFor(c, m.off);
    u.maxEnergy = info?.energy ?? 120;
    u.energy = u.maxEnergy * 0.5;
    for (const [id, def] of Object.entries(u.kit?.counters ?? {})) u.counters[id] = def.start ?? 0;
    return u;
  });
  const byKey = new Map(chars.map((u) => [u.key, u]));
  const elationCount = chars.filter((u) => u.path === "Elation").length;

  // Summons (memosprites and the like)
  const summons: U[] = [];
  for (const o of chars) {
    for (const s of o.kit?.summons ?? []) {
      const u = blank(`${o.key}:${s.id}`, "summon", 10 + summons.length, s.name);
      u.owner = o;
      u.level = o.level;
      u.element = o.element;
      u.path = o.path;
      u.summonAction = s.action;
      u.summonSpd = s.spd;
      u.active = s.start !== false;
      summons.push(u);
    }
  }

  // Enemies
  const enemies: U[] = Array.from({ length: Math.max(1, enemy.count) }, (_, i) => {
    const u = blank(`enemy${i}`, "enemy", 20 + i, `적 ${i + 1}`);
    u.level = enemy.level;
    u.maxToughness = enemy.toughness;
    u.toughness = enemy.toughness;
    return u;
  });

  /** Single-target and blast attacks aim at the middle enemy */
  const mainEnemy = () => enemies[Math.floor((enemies.length - 1) / 2)];

  const aha = blank("aha", "aha", 30, "아하");
  aha.active = elationCount > 0;
  punch = elationCount;

  const allUnits = () => [...chars, ...summons.filter((s) => s.active), ...(aha.active ? [aha] : []), ...enemies];

  // ----- Values and stats -----

  interface Ctx {
    owner: U;
    holder?: U;
    source?: U;
    amount?: number;
    types?: DmgType[];
    element?: ElementId;
    enemy?: U;
  }
  const guard = new Set<Buff>();

  const skillLevel = (c: OwnedCharacter, id: string) => {
    const s = skillData.characters[c.id]?.skills[id];
    const lv = c.skills?.[id] ?? (s?.point ? c.skills?.[`point:${s.point}`] : undefined);
    if (lv) return lv;
    // Unknown (older sync): the usual cap without eidolons
    if (!s) return 1;
    return Math.min(s.maxLevel ?? 10, s.type === "Normal" || s.type.startsWith("Memosprite") ? 6 : 10);
  };

  const val = (v: Value | undefined, ctx: Ctx): number => {
    if (v === undefined) return 1;
    if (typeof v === "number") return v;
    const o = ctx.owner;
    const c = o.kind === "summon" ? o.owner?.c : o.c;
    if ("skill" in v) {
      if (!c) return 0;
      const s = skillData.characters[c.id]?.skills[v.skill];
      if (!s) return 0;
      const row = s.params[Math.min(s.params.length, skillLevel(c, v.skill)) - 1] ?? s.params[0];
      return row?.[v.p] ?? 0;
    }
    if ("tree" in v) {
      // A locked trace gives nothing
      if (c?.traces && !c.traces.includes(v.tree)) return 0;
      return (c && skillData.characters[c.id]?.traces[v.tree]?.[v.p]) ?? 0;
    }
    if ("punch" in v) return punch;
    if ("sp" in v) return sp;
    if ("banger" in v) return (o.kind === "summon" ? o.owner?.banger : o.banger)?.v ?? 0;
    if ("lc" in v) {
      const lc = c?.lightCone;
      if (!lc) return 0;
      const rows = skillData.lightCones[lc.id];
      return rows?.[Math.max(1, Math.min(5, lc.superimposition || 1)) - 1]?.[v.lc] ?? 0;
    }
    if ("stat" in v) {
      const who = v.of === "holder" ? ctx.holder : v.of === "source" ? ctx.source : o;
      if (!who) return 0;
      return stat(who, v.stat, { ...ctx, owner: who, holder: who }, v.base, v.without);
    }
    if ("add" in v) return v.add.reduce<number>((a, x) => a + val(x, ctx), 0);
    if ("mul" in v) return v.mul.reduce<number>((a, x) => a * val(x, ctx), 1);
    if ("sub" in v) return val(v.sub[0], ctx) - val(v.sub[1], ctx);
    if ("div" in v) {
      const b = val(v.div[1], ctx);
      return b ? val(v.div[0], ctx) / b : 0;
    }
    if ("min" in v) return Math.min(...v.min.map((x) => val(x, ctx)));
    if ("max" in v) return Math.max(...v.max.map((x) => val(x, ctx)));
    if ("steps" in v) {
      const st = v.steps;
      const who = st.of === "holder" ? (ctx.holder ?? o) : o;
      const s = stat(who, st.stat, { ...ctx, owner: who, holder: who });
      const over = val(st.over, ctx);
      const cap = st.max !== undefined ? over + val(st.max, ctx) : Infinity;
      const per = val(st.per, ctx) || 1;
      return Math.max(0, Math.floor((Math.min(s, cap) - over) / per + 1e-9));
    }
    if ("count" in v) return v.count === "debuffs" ? debuffCount(ctx.enemy ?? mainEnemy()) : countOf(v.count);
    if ("maxEnergy" in v) {
      const who = v.maxEnergy === "holder" ? (ctx.holder ?? o) : o;
      return (who.kind === "summon" ? who.owner : who)?.maxEnergy ?? 0;
    }
    if ("counter" in v) return (o.kind === "summon" ? o.owner : o)?.counters[v.counter] ?? 0;
    if ("pick" in v) {
      const i = Math.round(val(v.by, ctx));
      if (i < 1) return 0;
      return val(v.pick[Math.min(i, v.pick.length) - 1], ctx);
    }
    if ("ev" in v) return ctx.amount ?? 0;
    if ("rank" in v) {
      const c2 = o.kind === "summon" ? o.owner?.c : o.c;
      return (c2?.eidolon ?? 0) >= v.rank ? 1 : 0;
    }
    if ("floor" in v) return Math.floor(val(v.floor, ctx) + 1e-9);
    if ("trace" in v) {
      const c2 = o.kind === "summon" ? o.owner?.c : o.c;
      return !c2?.traces || c2.traces.includes(v.trace) ? 1 : 0;
    }
    if ("gte" in v) return val(v.gte[0], ctx) >= val(v.gte[1], ctx) - 1e-9 ? 1 : 0;
    return 0;
  };

  const countOf = (what: string) => {
    if (what === "enemies") return enemies.length;
    if (what === "team") return chars.length;
    if (what.startsWith("path:")) return chars.filter((u) => u.path === what.slice(5)).length;
    if (what.startsWith("element:")) return chars.filter((u) => u.element === what.slice(8)).length;
    return 0;
  };

  const condOk = (cnd: Cond | undefined, ctx: Ctx): boolean => {
    if (!cnd) return true;
    const o = ctx.owner;
    const holder = ctx.holder ?? o;
    if (cnd.broken !== undefined && (ctx.enemy ?? mainEnemy()).broken !== cnd.broken) return false;
    if (cnd.stat) {
      const who = cnd.stat.of === "holder" ? holder : o;
      const s = stat(who, cnd.stat.key, { ...ctx, owner: who, holder: who });
      if (cnd.stat.gte !== undefined && s < val(cnd.stat.gte, ctx) - 1e-9) return false;
      if (cnd.stat.lte !== undefined && s > val(cnd.stat.lte, ctx) + 1e-9) return false;
    }
    if (cnd.count) {
      const n = countOf(cnd.count.of);
      if (cnd.count.gte !== undefined && n < cnd.count.gte) return false;
      if (cnd.count.lte !== undefined && n > cnd.count.lte) return false;
    }
    if (cnd.counter) {
      const n = (o.kind === "summon" ? o.owner! : o).counters[cnd.counter.id] ?? 0;
      if (cnd.counter.gte !== undefined && n < cnd.counter.gte) return false;
      if (cnd.counter.lte !== undefined && n > cnd.counter.lte) return false;
    }
    const so = o.kind === "summon" && o.owner ? o.owner : o;
    if (cnd.state && !so.states.some((s) => s.def.id === cnd.state)) return false;
    if (cnd.notState && so.states.some((s) => s.def.id === cnd.notState)) return false;
    if (cnd.debuffs && debuffCount(ctx.enemy ?? mainEnemy()) < cnd.debuffs.gte) return false;
    const pathOf = ctx.source && !ctx.holder ? ctx.source : holder;
    if (cnd.path && pathOf.path !== cnd.path) return false;
    if (cnd.notPath && pathOf.path === cnd.notPath) return false;
    if (cnd.banger !== undefined && !!(o.kind === "summon" ? o.owner?.banger : o.banger) !== cnd.banger) return false;
    if (cnd.weak && !isWeak(cnd.weak)) return false;
    if (cnd.maxEnergy) {
      if (cnd.maxEnergy.gte !== undefined && holder.maxEnergy < cnd.maxEnergy.gte) return false;
      if (cnd.maxEnergy.lte !== undefined && holder.maxEnergy > cnd.maxEnergy.lte) return false;
    }
    if (cnd.ahaExtra !== undefined && (ahaExtraBy === (o.kind === "summon" ? o.owner : o)) !== cnd.ahaExtra) return false;
    if (cnd.holder && !condOk(cnd.holder, { ...ctx, holder })) return false;
    if (cnd.source) {
      const s = ctx.source && ctx.source.kind === "summon" && ctx.source.owner ? ctx.source.owner : ctx.source;
      if (!s || !condOk(cnd.source, { ...ctx, holder: s })) return false;
    }
    if (cnd.chosen !== undefined && (holder === allyTarget(o.kind === "summon" && o.owner ? o.owner : o)) !== cnd.chosen) return false;
    if (cnd.ev) {
      const a = ctx.amount ?? 0;
      if (cnd.ev.gte !== undefined && a < cnd.ev.gte) return false;
      if (cnd.ev.lte !== undefined && a > cnd.ev.lte) return false;
    }
    if (cnd.all && !cnd.all.every((x) => condOk(x, ctx))) return false;
    if (cnd.any && !cnd.any.some((x) => condOk(x, ctx))) return false;
    return true;
  };

  const debuffCount = (e: U) => e.buffs.filter((b) => b.owner.kind !== "enemy").length + e.dots.length;

  const filterOk = (b: Buff, ctx: Ctx) => {
    const e = b.src.eff;
    if (e.types && !(ctx.types ?? []).some((x) => e.types!.includes(x))) return false;
    if (e.element && ctx.element !== e.element) return false;
    return true;
  };

  /** Sum of buffs of one stat on a unit. Buffs being evaluated are skipped (no loops). */
  const buffSum = (u: U, key: string, ctx: Ctx, without?: string[]) => {
    let sum = 0;
    for (const b of u.buffs) {
      if (b.src.eff.stat !== key || guard.has(b)) continue;
      if (without && b.src.eff.id && without.includes(b.src.eff.id)) continue;
      if (!filterOk(b, ctx)) continue;
      guard.add(b);
      try {
        const bctx: Ctx = { ...ctx, owner: b.owner, holder: u };
        if (!condOk(b.src.eff.cond, bctx)) continue;
        const chance = b.src.eff.chance !== undefined ? val(b.src.eff.chance, bctx) : 1;
        sum += val(b.src.eff.value, bctx) * b.stacks * (chance < 0.5 ? chance : 1);
      } finally {
        guard.delete(b);
      }
    }
    return sum;
  };

  const sheet = (u: U, key: StatKey) => {
    const c = u.kind === "summon" ? u.owner?.c : u.c;
    if (!c) return { base: 0, fin: 0 };
    const l = statsOf(c).find((x) => x.key === key);
    return l ? { base: l.base, fin: l.base + l.bonus } : { base: 0, fin: 0 };
  };

  function stat(u: U, key: string, ctx: Ctx, baseOnly = false, without?: string[]): number {
    // Summons use their owner's stats plus their own buffs
    const su = u.kind === "summon" && u.owner ? u.owner : u;
    if (u.kind === "enemy") return buffSum(u, key, ctx, without);
    if (u.kind === "aha") return 0;
    if (u.kind === "summon" && key !== "SPD") {
      const own = { ...ctx, holder: u };
      const extra = ["ATK", "HP", "DEF"].includes(key)
        ? sheet(su, key as StatKey).base * buffSum(u, `${key}%`, own, without) + buffSum(u, key, own, without)
        : buffSum(u, key, own, without);
      return stat(su, key, ctx, baseOnly, without) + extra;
    }
    const sc = { ...ctx, holder: su };
    switch (key) {
      case "ATK":
      case "HP":
      case "DEF": {
        const s = sheet(su, key as StatKey);
        if (baseOnly) return s.base;
        return s.fin + s.base * buffSum(su, `${key}%`, sc, without) + buffSum(su, key, sc, without);
      }
      case "SPD": {
        if (u.kind === "summon") return u.summonSpd !== undefined && u.owner ? val(u.summonSpd, { owner: u.owner, holder: u }) : 100;
        if (u.countdown !== null) return u.countdown;
        const s = sheet(su, "SPD");
        if (baseOnly) return s.base;
        return Math.max(1, s.fin + (u.cfg?.extraSpd ?? 0) + s.base * buffSum(su, "SPD%", sc, without) + buffSum(su, "SPD", sc, without));
      }
      case "CR":
      case "CD":
      case "BE":
      case "ERR":
      case "EHR":
      case "RES":
      case "OHB":
      case "ELA":
        return sheet(su, key as StatKey).fin + buffSum(su, key, sc, without);
      case "DMG%": {
        const el = ctx.element ? sheet(su, `${ctx.element}_DMG` as StatKey).fin : 0;
        return el + buffSum(su, "DMG%", sc, without);
      }
      default:
        return buffSum(su, key, sc, without);
    }
  }

  const spdOf = (u: U): number => {
    if (u.kind === "aha") {
      const s = chars
        .filter((c) => c.path === "Elation")
        .map((c) => spdOf(c))
        .sort((a, b) => b - a);
      return 80 + (s[0] ?? 0) / 5 + (s[1] ?? 0) / 10 + (s[2] ?? 0) / 20 + (s[3] ?? 0) / 40 + aha.ahaBonus;
    }
    if (u.kind === "enemy") return Math.max(1, enemy.spd * (1 + buffSum(u, "SPD%", { owner: u })));
    return stat(u, "SPD", { owner: u });
  };

  // ----- Targets -----

  const allyTarget = (o: U) => {
    const k = o.cfg?.target;
    const t = k ? byKey.get(k) : undefined;
    return t && t !== o ? t : chars.find((c) => c !== o);
  };
  const targets = (o: U, to: string | undefined, ctx: Ctx): U[] => {
    const owner = o.kind === "summon" && o.owner ? o.owner : o;
    switch (to ?? "self") {
      case "self":
        return [o];
      case "ally": {
        const a = allyTarget(owner);
        return a ? [a] : [];
      }
      case "team":
        return chars;
      case "others":
        return chars.filter((c) => c !== owner);
      case "source":
        return ctx.source ? [ctx.source.kind === "summon" && ctx.source.owner ? ctx.source.owner : ctx.source] : [];
      case "enemy":
        return [ctx.enemy ?? mainEnemy()];
      case "enemies":
        return enemies;
      default: {
        if (to!.startsWith("path:")) return chars.filter((c) => c.path === to!.slice(5));
        if (to!.startsWith("element:")) return chars.filter((c) => c.element === to!.slice(8));
        if (to!.startsWith("summon:")) return summons.filter((s) => s.owner === owner && s.key.endsWith(`:${to!.slice(7)}`));
        return [o];
      }
    }
  };

  // ----- Effects -----

  const queue: (() => void)[] = [];

  const addBuff = (owner: U, holder: U, src: Source, state?: string) => {
    const e = src.eff;
    const id = `${e.id ?? src.id}>${owner.key}`;
    const durOn = e.durOn ?? "target";
    const list = e.after ? holder.pending : holder.buffs;
    const old = list.find((b) => b.id === id);
    const left = e.dur !== undefined ? val(e.dur, { owner, holder }) : Infinity;
    if (old) {
      old.src = src;
      old.left = left;
      old.fresh = durOn === "target" && holder === turnOwner;
      if (e.stack) old.stacks = Math.min(e.stack, old.stacks + 1);
      return;
    }
    list.push({ id, src, owner, holder, stacks: 1, left, durOn, fresh: durOn === "target" && holder === turnOwner, state: state ?? src.state, seq: actionSeq });
  };

  const apply = (owner: U, src: Source, ctx: Ctx) => {
    if (!src.on) return;
    const e = src.eff;
    const oc = owner.kind === "summon" ? owner.owner?.c : owner.c;
    if (oc && ((e.rank && oc.eidolon < e.rank) || (e.maxRank && oc.eidolon >= e.maxRank) || (e.trace && oc.traces && !oc.traces.includes(e.trace)))) return;
    if ((owner.cfg?.off ?? []).includes(src.id)) return;
    const key = src.id;
    if (e.limit?.total !== undefined && (owner.fired.get(key) ?? 0) >= e.limit.total) return;
    if (e.limit?.perTurn !== undefined && (owner.firedTurn.get(key) ?? 0) >= e.limit.perTurn) return;
    // Owner-side conditions (path / notPath are checked per target)
    const { path, notPath, maxEnergy, holder: holderCond, ...rest } = e.cond ?? {};
    if (!condOk(rest, { ...ctx, owner })) return;
    owner.fired.set(key, (owner.fired.get(key) ?? 0) + 1);
    owner.firedTurn.set(key, (owner.firedTurn.get(key) ?? 0) + 1);
    const list = targets(owner, e.to, ctx).filter((x) => condOk({ path, notPath, maxEnergy, holder: holderCond }, { ...ctx, owner, holder: x }));
    // Per-target conditions also gate effects that act on the owner (sp, counters, actions...)
    if ((path || notPath || maxEnergy || holderCond) && !list.length) return;
    const v = () => val(e.value, { ...ctx, owner });

    if (e.stat) {
      for (const x of list) addBuff(owner, x, src);
      return;
    }
    switch (e.do) {
      case "advance": {
        const r = v();
        for (const x of list) {
          // During its own turn the gauge is reset at turn end, so carry the advance over
          if (x === turnOwner) x.next = Math.min(1, x.next + r);
          else x.d = Math.max(0, x.d - GAUGE * r);
        }
        break;
      }
      case "nextAdvance":
        owner.next = Math.max(owner.next, v());
        break;
      case "countdown":
        owner.countdown = v();
        owner.d = GAUGE;
        break;
      case "energy": {
        // Energy recovery scales with energy regeneration unless the text says it is fixed (고정)
        for (const x of list) {
          if (x.kind !== "char") continue;
          const r = val(e.value, { ...ctx, owner, holder: x });
          x.energy = Math.min(x.maxEnergy, x.energy + r * (e.fixed ? 1 : errOf(x)));
        }
        break;
      }
      case "maxSp":
        spMax = Math.max(1, spMax + v());
        break;
      case "energyPct": {
        const r = v();
        for (const x of list) if (x.kind === "char") x.energy = Math.min(x.maxEnergy, x.energy + x.maxEnergy * r);
        break;
      }
      case "bangerExtend": {
        const r = v();
        for (const x of list) if (x.banger) x.banger.left += r;
        break;
      }
      case "unstack": {
        const r = Math.max(1, Math.round(v()));
        for (const x of list) {
          for (const bf of x.buffs) if (bf.src.eff.id === e.ref) bf.stacks -= r;
          x.buffs = x.buffs.filter((bf) => bf.stacks > 0);
        }
        break;
      }
      case "stateUses": {
        const r = v();
        for (const x of list) for (const st of x.states) if (st.def.id === e.ref) st.uses += r;
        break;
      }
      case "sp":
        sp = Math.max(0, Math.min(spMax, sp + v()));
        break;
      case "punchline":
        gainPunch(v(), owner);
        break;
      case "banger": {
        const r = v();
        for (const x of list) x.banger = { v: (x.banger?.v ?? 0) + r, left: Math.max(x.banger?.left ?? 0, 2) };
        break;
      }
      case "extraTurn":
        for (const x of list) queue.push(() => extraTurn(x, e.ref));
        break;
      case "ahaExtraTurn":
        if (aha.active) {
          const fixed = v();
          queue.push(() => ahaInstant(fixed, owner));
        }
        break;
      case "ahaSpd":
        if (aha.active) aha.ahaBonus += v();
        break;
      case "action": {
        const name = e.ref ?? "followup";
        const chance = e.chance !== undefined ? val(e.chance, { ...ctx, owner }) : 1;
        queue.push(() => doAction(owner, name, { extra: true, scale: chance, enemy: ctx.enemy }));
        break;
      }
      case "counter":
        addCounter(owner.kind === "summon" ? owner.owner! : owner, e.ref ?? "", v(), ctx);
        break;
      case "setCounter": {
        const w = owner.kind === "summon" ? owner.owner! : owner;
        addCounter(w, e.ref ?? "", v() - (w.counters[e.ref ?? ""] ?? 0), ctx);
        break;
      }
      case "state":
        for (const x of list) enterState(x.kind === "summon" ? x.owner! : x, e.ref ?? "");
        break;
      case "endState":
        for (const x of list) endState(x, e.ref ?? "");
        break;
      case "dmg":
        for (const h of e.hits ?? []) {
          resolveHit(owner, h, (h.types?.[0] ?? "additional") as DmgType, e.label ?? e.note, ctx.enemy, e.chance !== undefined ? val(e.chance, { ...ctx, owner }) : 1);
        }
        break;
      case "dot": {
        if (!e.dot) break;
        const scale = e.dot.scale ?? owner.kit?.scale ?? "ATK";
        for (const x of list.filter((u) => u.kind === "enemy")) {
          const id = e.dot.id ?? e.note;
          const old = x.dots.find((d) => d.owner === owner && d.id === id);
          const dur = val(e.dot.dur, { ...ctx, owner });
          x.dots = x.dots.filter((d) => d !== old);
          x.dots.push({
            owner,
            mult: val(e.dot.mult, { ...ctx, owner }) * (e.chance !== undefined ? val(e.chance, { ...ctx, owner }) : 1),
            scale,
            element: e.dot.element ?? owner.element ?? "Physical",
            // Re-applying never shortens a longer DoT
            left: Math.max(dur, old?.left ?? 0),
            label: e.label ?? e.note,
            id,
          });
        }
        break;
      }
      case "detonate": {
        const r = v();
        // ref "own": only the owner's DoTs
        for (const x of list.filter((u) => u.kind === "enemy"))
          for (const d of [...x.dots]) if (e.ref !== "own" || d.owner === owner) tickDot(x, d, r);
        break;
      }
      case "toughness": {
        const r = v();
        for (const x of list.filter((u) => u.kind === "enemy")) reduceToughness(owner, x, r, owner.element ?? "Physical", true);
        break;
      }
      case "summon":
        for (const s of summons) if (s.owner === owner && s.key.endsWith(`:${e.ref}`)) {
          s.active = true;
          s.d = GAUGE;
        }
        break;
    }
  };

  const ownTriggers = new Set(["start", "turnStart", "turnEnd", "attack", "selfBreak"]);

  /** Fire a trigger from `actor`'s point of view for everyone who listens. */
  const fire = (trigger: string, actor: U | null, ctx: Partial<Ctx> = {}) => {
    const actorOwner = actor && actor.kind === "summon" ? actor.owner! : actor;
    for (const u of [...chars, ...summons]) {
      const self = u === actor || (actor?.kind === "summon" && actor.owner === u);
      const allyActor = !!actorOwner && (actorOwner.kind === "char") && actorOwner !== u && u.kind === "char";
      for (const s of u.sources) {
        const on = s.eff.on;
        if (on === "passive") continue;
        let hit = false;
        if (on === trigger) {
          if (ownTriggers.has(trigger) || isOwnActionTrigger(trigger)) hit = self;
          else if (trigger.startsWith("ally")) hit = allyActor;
          else hit = true;
        }
        if (!hit) continue;
        apply(u, s, { owner: u, source: actor ?? undefined, ...ctx });
      }
    }
    // State effects
    for (const u of chars) {
      for (const st of u.states) {
        for (const [i, e] of (st.def.effects ?? []).entries()) {
          if (e.on === "passive" || e.on !== trigger) continue;
          const own = ownTriggers.has(trigger) || isOwnActionTrigger(trigger);
          if (own && u !== actor) continue;
          if (trigger.startsWith("ally") && (actorOwner === u || !actorOwner || actorOwner.kind !== "char")) continue;
          apply(u, { id: `st:${u.key}:${st.def.id}:${i}`, from: "kit", eff: e, on: true, state: st.def.id }, { owner: u, source: actor ?? undefined, ...ctx });
        }
      }
    }
  };
  const isOwnActionTrigger = (t: string) =>
    t.startsWith("action:") ||
    t.startsWith("before:") ||
    t.startsWith("counter:") ||
    t.startsWith("summon:") || ["basic", "skill", "ult", "followup", "elation", "memosprite", "summon"].includes(t);

  const addCounter = (u: U, id: string, n: number, ctx: Ctx) => {
    const def = u.kit?.counters?.[id];
    const before = u.counters[id] ?? 0;
    let now = before + n;
    if (def?.max !== undefined) now = Math.min(val(def.max, { owner: u }), now);
    u.counters[id] = Math.max(0, now);
    if (def?.at === undefined) return;
    const at = val(def.at, { owner: u });
    const hit = () => {
      for (const [i, e] of (def.then ?? []).entries()) apply(u, { id: `ct:${u.key}:${id}:${i}`, from: "kit", eff: e, on: true }, { ...ctx, owner: u });
      fire(`counter:${id}`, u, ctx);
    };
    if (def.repeat && at > 0) {
      for (let i = 0; i < 20 && u.counters[id] >= at - 1e-9; i++) {
        u.counters[id] -= at;
        hit();
      }
    } else if (before < at && u.counters[id] >= at - 1e-9) {
      if (def.reset !== undefined) u.counters[id] = def.reset;
      hit();
    }
  };

  const enterState = (u: U, id: string) => {
    const def = u.kit?.states?.find((s) => s.id === id);
    if (!def) return;
    const dur = def.dur !== undefined ? val(def.dur, { owner: u }) : Infinity;
    const old = u.states.find((s) => s.def.id === id);
    if (old) {
      old.uses = def.uses ?? Infinity;
      old.left = dur;
      old.fresh = u === turnOwner;
      return;
    }
    u.states.push({ def, uses: def.uses ?? Infinity, left: dur, fresh: u === turnOwner });
    // Passive effects of the state become buffs while it lasts
    (def.effects ?? []).forEach((e, i) => {
      if (e.on !== "passive" || !e.stat) return;
      const eid = u.c?.eidolon ?? 0;
      if ((e.rank && eid < e.rank) || (e.maxRank && eid >= e.maxRank) || (e.trace && u.c?.traces && !u.c.traces.includes(e.trace))) return;
      const src: Source = { id: `st:${u.key}:${id}:${i}`, from: "kit", eff: e, on: !(u.cfg?.off ?? []).includes(`st:${u.key}:${id}:${i}`) };
      if (!src.on) return;
      for (const x of targets(u, e.to, { owner: u })) addBuff(u, x, src, id);
    });
  };
  const endState = (u: U, id: string) => {
    const st = u.states.find((s) => s.def.id === id);
    if (!st) return;
    u.states = u.states.filter((s) => s !== st);
    for (const x of allUnits()) x.buffs = x.buffs.filter((b) => !(b.state === id && b.owner === u));
    (st.def.onEnd ?? []).forEach((e, i) => apply(u, { id: `se:${u.key}:${id}:${i}`, from: "kit", eff: e, on: true }, { owner: u }));
  };

  const gainPunch = (n: number, by: U) => {
    if (!aha.active || n <= 0) return;
    punch += n;
    fire("punchline", by, { amount: n });
  };

  // ----- Damage -----

  const isWeak = (el: ElementId) => enemy.weak === "all" || enemy.weak.includes(el);

  const defMult = (attacker: U, e: U, ctx: Ctx) => {
    const lvA = attacker.level;
    const red = stat(e, "DEFDown", ctx) + stat(attacker, "DEFIgnore", ctx);
    return (lvA + 20) / ((e.level + 20) * Math.max(0, 1 - red) + lvA + 20);
  };
  const resMult = (attacker: U, e: U, el: ElementId, ctx: Ctx) => {
    const res = (isWeak(el) ? 0 : enemy.res) - stat(e, "RESDown", ctx) - stat(attacker, "RESPen", ctx);
    return Math.min(2, Math.max(0.1, 1 - res));
  };
  const vulnMult = (e: U, ctx: Ctx) => 1 + stat(e, "Vuln", ctx);
  const brokenMult = (e: U) => (e.broken ? 1 : 0.9);

  const record = (by: U, action: string, type: DmgType, amount: number, parts?: Record<string, number>) => {
    if (!(amount > 0)) return;
    const credit = by.kind === "summon" && by.owner ? by.owner : by;
    damage.push({ av: t, key: credit.key, by: by.name, action, type, amount, parts });
    if (current && (current.kind === "aha" || current.key === credit.key || current.owner === credit.key)) current.damage += amount;
  };

  const breakEnemy = (attacker: U, e: U, el: ElementId) => {
    e.broken = true;
    e.toughness = 0;
    const ctx: Ctx = { owner: attacker, types: ["break"], element: el, enemy: e };
    const be = stat(attacker, "BE", ctx);
    const lm = breakLevelMult(attacker.level);
    const mtm = 0.5 + e.maxToughness / 40;
    const common = (1 + be) * defMult(attacker, e, ctx) * resMult(attacker, e, el, ctx) * vulnMult(e, ctx);
    const breakDmg = BREAK_FACTOR[el] * lm * mtm * common * (1 + stat(attacker, "breakDMG%", ctx)) * 0.9;
    record(attacker, "격파", "break", breakDmg);
    e.d += GAUGE * 0.25;
    // Break debuffs
    const dot = (base: number, left: number, label: string) =>
      e.dots.push({ owner: attacker, mult: 0, scale: "ATK", element: el, left, breakBase: base * (1 + be), label });
    if (el === "Fire") dot(lm, 2, "연소");
    else if (el === "Thunder") dot(2 * lm, 2, "감전");
    else if (el === "Physical") dot(2 * lm * mtm, 2, "열상");
    else if (el === "Wind") dot(3 * lm, 2, "풍화");
    else if (el === "Ice") dot(lm, 1, "동결");
    else if (el === "Quantum") {
      dot(0.6 * lm * mtm, 1, "얽힘");
      e.d += GAUGE * 0.2 * (1 + be);
    } else if (el === "Imaginary") e.d += GAUGE * 0.3 * (1 + be);
    fire("break", attacker, { enemy: e });
    fire("selfBreak", attacker, { enemy: e });
  };

  const reduceToughness = (attacker: U, e: U, amount: number, el: ElementId, any = false, types: DmgType[] = []) => {
    if (amount <= 0) return;
    const ctx: Ctx = { owner: attacker, element: el, enemy: e, types };
    const red = amount * (1 + Math.min(3, stat(attacker, "breakEff", ctx)));
    if (!e.broken && (any || isWeak(el))) {
      e.toughness -= red;
      if (e.toughness <= 1e-9) breakEnemy(attacker, e, el);
      return;
    }
    // Super Break
    const sctx: Ctx = { ...ctx, types: [...types, "superBreak", "break"] };
    const sb = stat(attacker, "superBreak", sctx);
    if (e.broken && sb > 0) {
      const dmg =
        (red / 10) *
        breakLevelMult(attacker.level) *
        sb *
        (1 + stat(attacker, "BE", sctx)) *
        (1 + stat(attacker, "breakDMG%", sctx)) *
        (1 + stat(attacker, "superBreakDMG%", sctx)) *
        defMult(attacker, e, sctx) *
        resMult(attacker, e, el, sctx) *
        vulnMult(e, sctx) *
        1;
      record(attacker, "슈퍼 격파", "superBreak", dmg);
    }
  };

  const tickDot = (e: U, d: Dot, ratio = 1) => {
    const ctx: Ctx = { owner: d.owner, types: d.breakBase !== undefined ? ["dot", "break"] : ["dot"], element: d.element, enemy: e };
    let amount: number;
    if (d.breakBase !== undefined) {
      amount = d.breakBase * defMult(d.owner, e, ctx) * resMult(d.owner, e, d.element, ctx) * vulnMult(e, ctx) * brokenMult(e);
    } else {
      const base = stat(d.owner, d.scale, ctx) * (d.mult + stat(d.owner, "multAdd", ctx));
      amount =
        base *
        (1 + stat(d.owner, "DMG%", ctx)) *
        defMult(d.owner, e, ctx) *
        resMult(d.owner, e, d.element, ctx) *
        vulnMult(e, ctx) *
        brokenMult(e) *
        (1 + stat(d.owner, "finalMult", ctx));
    }
    record(d.owner, d.label, "dot", amount * ratio);
  };

  /** One hit on one enemy; returns the damage. */
  const hitOne = (attacker: U, h: Hit, mult: number, type: DmgType, e: U, label: string, scale: number, toughness: number) => {
    if (h.cond && !condOk(h.cond, { owner: attacker, enemy: e })) return 0;
    const el = h.element ?? attacker.element ?? "Physical";
    const types = [type, ...(h.types ?? []), ...(h.elation ? (["elation"] as DmgType[]) : [])] as DmgType[];
    const ctx: Ctx = { owner: attacker, types, element: el, enemy: e };
    const cr = Math.min(1, Math.max(0, stat(attacker, "CR", ctx)));
    const cd = stat(attacker, "CD", ctx);
    const crit = h.noCrit || type === "dot" ? 1 : 1 + cr * cd;
    const def = defMult(attacker, e, ctx);
    const res = resMult(attacker, e, el, ctx);
    const vuln = vulnMult(e, ctx);
    const final = 1 + stat(attacker, "finalMult", ctx);
    let amount: number;
    const parts: Record<string, number> = { crit, def, res, vuln, broken: brokenMult(e) };
    if (h.breakRatio !== undefined) {
      // "X% of <element> Break DMG": break formula, no crit or DMG boost
      const bctx: Ctx = { ...ctx, types: [...types, "break"] };
      const mt = h.maxToughness !== undefined ? Math.min(e.maxToughness, h.maxToughness) : e.maxToughness;
      const be = 1 + stat(attacker, "BE", bctx);
      amount =
        BREAK_FACTOR[el] *
        breakLevelMult(attacker.level) *
        (0.5 + mt / 40) *
        val(h.breakRatio, bctx) *
        be *
        (1 + stat(attacker, "breakDMG%", bctx)) *
        defMult(attacker, e, bctx) *
        res *
        (1 + stat(e, "Vuln", bctx)) *
        brokenMult(e);
      Object.assign(parts, { crit: 1, be });
    } else if (h.elation || type === "elation") {
      const ow = attacker.kind === "summon" ? attacker.owner! : attacker;
      const p0 = h.punch === "banger" ? (ow.banger?.v ?? 0) : typeof h.punch === "number" ? h.punch : (ahaPunch ?? (ow.banger?.v || punch));
      const p = p0 * (h.punchMul !== undefined ? val(h.punchMul, ctx) : 1);
      const punchMult = 1 + (p * 5) / (p + 240);
      const ela = 1 + stat(attacker, "ELA", ctx);
      const merry = 1 + stat(attacker, "Merrymake", ctx);
      amount = elationLevelMult(attacker.level) * (mult + stat(attacker, "multAdd", ctx)) * crit * ela * punchMult * merry * def * res * vuln * brokenMult(e) * final;
      Object.assign(parts, { punch: p, ela });
    } else {
      const sc = h.scale ?? attacker.kit?.scale ?? (attacker.kind === "summon" ? attacker.owner?.kit?.scale : undefined) ?? "ATK";
      const base = stat(attacker, sc, ctx) * (mult + stat(attacker, "multAdd", ctx)) + (h.flat !== undefined ? val(h.flat, ctx) : 0);
      const boost = 1 + stat(attacker, "DMG%", ctx);
      amount = base * crit * boost * def * res * vuln * brokenMult(e) * final;
      Object.assign(parts, { base, boost });
    }
    amount *= scale;
    record(attacker, label, type, amount, parts);
    if (toughness > 0) reduceToughness(attacker, e, toughness * scale, el, !!h.ignoreWeak, types);
    return amount;
  };

  const resolveHit = (attacker: U, h: Hit, type: DmgType, label: string, main?: U, scale = 1, skillId?: string) => {
    const ctx: Ctx = { owner: attacker, types: [type, ...(h.types ?? [])] };
    const mult = val(h.mult ?? 0, ctx);
    const area = h.area ?? "single";
    const tMain = main ?? mainEnemy();
    const idx = enemies.indexOf(tMain);
    let tough = typeof h.toughness === "number" ? h.toughness : 0;
    let adjTough = h.adjToughness ?? 0;
    if (h.toughness === "auto" && skillId) {
      const c = attacker.kind === "summon" ? attacker.owner?.c : attacker.c;
      const td = c ? skillData.characters[c.id]?.skills[skillId]?.tough : undefined;
      if (td) {
        if (area === "aoe") {
          tough = td.all ?? td.one ?? 0;
        } else {
          tough = td.one ?? td.all ?? 0;
          adjTough = h.adjToughness ?? td.spread ?? 0;
        }
      }
    }
    if (area === "single") hitOne(attacker, h, mult, type, tMain, label, scale, tough);
    else if (area === "blast") {
      hitOne(attacker, h, mult, type, tMain, label, scale, tough);
      const adjMult = val(h.adjMult ?? h.mult ?? 0, ctx);
      for (const j of [idx - 1, idx + 1]) if (enemies[j]) hitOne(attacker, h, adjMult, type, enemies[j], label, scale, adjTough);
    } else if (area === "aoe") {
      for (const e of enemies) hitOne(attacker, h, mult, type, e, label, scale, tough);
    } else if (area === "split") {
      for (const e of enemies) hitOne(attacker, h, mult, type, e, label, scale / enemies.length, tough);
    } else if (area === "bounce") {
      const n = Math.max(0, Math.round(val(h.bounces ?? 1, ctx)));
      // Bounces spread evenly: the expected share of every enemy
      for (const e of enemies) hitOne(attacker, h, mult, type, e, label, (scale * n) / enemies.length, tough);
    }
  };

  // ----- Actions -----

  let actor: U | null = null;
  let actionSeq = 0;
  /** Unit whose own turn is running (buffs it gains now do not count this turn) */
  let turnOwner: U | null = null;

  const actionOf = (u: U, name: string): [string, KitAction | undefined] => {
    const kit = u.kind === "summon" ? u.owner?.kit : u.kit;
    let n = name;
    const owner = u.kind === "summon" ? u.owner! : u;
    for (const st of owner.states) if (st.def.replace?.[n]) n = st.def.replace[n];
    return [n, kit?.actions[n]];
  };

  const consumeStateUse = (u: U, name: string) => {
    for (const st of [...u.states]) {
      if (!Object.values(st.def.replace ?? {}).includes(name)) continue;
      st.uses--;
      if (st.uses <= 0) endState(u, st.def.id);
    }
  };

  /** Perform a named action. Returns the action type, or null when the kit has no such action. */
  function doAction(u: U, name: string, opt: { extra?: boolean; scale?: number; enemy?: U; label?: string; amount?: number } = {}): string | null {
    const [n, a] = actionOf(u, name);
    const owner = u.kind === "summon" ? u.owner! : u;
    const prev = actor;
    actor = u;
    try {
      if (!a) return null;
      const type = a.type;
      const spent = a.sp && a.sp < 0 ? -a.sp : 0;
      if (a.sp) {
        if (a.sp < 0) {
          sp = Math.max(0, sp + a.sp);
          fire("spSpent", u, { amount: -a.sp });
        } else sp = Math.min(spMax, sp + a.sp);
      }
      const label = opt.label ?? a.label ?? n;
      (a.before ?? []).forEach((e, i) => apply(owner, { id: `pre:${owner.key}:${n}:${i}`, from: "kit", eff: e, on: true }, { owner, enemy: opt.enemy, amount: opt.amount }));
      actionSeq++;
      const seq = actionSeq;
      const attacking = (a.hits?.length ?? 0) > 0 && !a.ally && !a.notAttack;
      // "발동 시 이번 공격…" effects: applied before the hits of the same action
      fire(`before:${type}`, u, { amount: opt.amount, enemy: opt.enemy });
      fire(`before:action:${n}`, u, { amount: opt.amount, enemy: opt.enemy });
      if (attacking) fire("before:attack", u, { amount: spent, enemy: opt.enemy });
      const dmgBefore = damage.length;
      for (const h of a.hits ?? []) resolveHit(u, h, type, label, opt.enemy, opt.scale ?? 1, a.skill);
      // Buffs used up by this action (gained before it)
      for (const x of [u, owner]) {
        x.buffs = x.buffs.filter((bf) => {
          const cons = bf.src.eff.consume;
          if (!cons || bf.seq >= seq) return true;
          return !(cons.includes(type) || (attacking && cons.includes("attack")));
        });
      }
      const c = owner.c;
      const energy = a.energy ?? (a.skill && c ? skillData.characters[c.id]?.skills[a.skill]?.energy : undefined);
      // Memosprite / summon actions give their owner the energy too
      if (energy && owner.kind === "char") {
        owner.energy = Math.min(owner.maxEnergy, owner.energy + energy * errOf(owner));
      }
      if (a.punchline !== undefined) gainPunch(val(a.punchline, { owner }), owner);
      // An attack whose hits were all gated off (cond) is not an attack
      const attacked = attacking && damage.length > dmgBefore;
      fire(type, u, { amount: opt.amount });
      fire(`action:${n}`, u, { amount: opt.amount });
      if (u.kind === "summon") fire(`summon:${u.key.split(":")[1]}`, owner);
      if (attacked) {
        fire("attack", u, { amount: spent });
        fire("anyAttack", u, { amount: spent });
        fire("allyAttack", u, { amount: spent });
      }
      if (type === "ult") {
        fire("anyUlt", u);
        fire("allyUlt", u);
      } else if (type === "skill") fire("allySkill", u);
      else if (type === "basic") fire("allyBasic", u);
      fire("allyAction", u);
      consumeStateUse(owner, n);
      return type;
    } finally {
      actor = prev;
    }
  }

  /** Energy regeneration multiplier (HoYoLAB reports 100% as 1) */
  const errOf = (u: U) => {
    const v = stat(u, "ERR", { owner: u });
    return v < 0.5 ? 1 + v : v;
  };

  /** Energy an ultimate costs: the game data's cost when it is below max energy (e.g. 240 of 480) */
  const ultNeed = (u: U) => {
    const id = u.kit?.actions.ult?.skill;
    const need = id && u.c ? skillData.characters[u.c.id]?.skills[id]?.need : undefined;
    return need && need < u.maxEnergy ? need : u.maxEnergy;
  };

  const canUlt = (u: U) => {
    if (u.kind !== "char") return false;
    if (u.states.some((s) => s.def.blockUlt)) return false;
    if (u.kit?.ultCost) return (u.counters[u.kit.ultCost.counter] ?? 0) >= val(u.kit.ultCost.n, { owner: u }) - 1e-9;
    return u.energy >= ultNeed(u) - 1e-6;
  };

  const castUlt = (u: U) => {
    if (u.kit?.ultCost) {
      if (!u.kit.ultCost.keep) u.counters[u.kit.ultCost.counter] -= val(u.kit.ultCost.n, { owner: u });
    } else u.energy = Math.max(0, u.energy - ultNeed(u));
    const ev = turnEvent(u, "ult", "ult", true);
    const prev = current;
    current = ev;
    const type = doAction(u, "ult");
    if (type === null) {
      // Speed-only character: the ultimate still triggers its speed effects
      const prevA = actor;
      actor = u;
      fire("ult", u);
      fire("anyUlt", u);
      fire("allyUlt", u);
      actor = prevA;
    }
    current = prev;
    u.ultTurn = u.turns;
  };

  const turnEvent = (u: U, action: string, type: string, ult: boolean, extra = false): TurnEvent => {
    const owner = u.kind === "summon" ? u.owner : undefined;
    const ev: TurnEvent = {
      key: u.key,
      owner: owner?.key,
      name: u.name,
      kind: u.kind,
      av: t,
      cycle: cycleOf(t),
      n: u.turns,
      action,
      type,
      ult,
      extra,
      spd: spdOf(u),
      sp,
      damage: 0,
      dmgStart: damage.length,
      snap: snapshot(u),
    };
    turns.push(ev);
    return ev;
  };

  const snapshot = (acting: U): Snapshot => ({
    sp,
    punch,
    units: allUnits().map((v) => {
      const s = spdOf(v);
      return {
        key: v.key,
        name: v.name,
        kind: v.kind,
        wait: v === acting ? 0 : v.d / s,
        spd: s,
        // Ultimate gauge: energy, or the counter the kit pays its ultimate with
        energy: v.kind === "char" ? (v.kit?.ultCost ? (v.counters[v.kit.ultCost.counter] ?? 0) : v.energy) : undefined,
        maxEnergy: v.kind === "char" ? (v.kit?.ultCost ? val(v.kit.ultCost.n, { owner: v }) : v.maxEnergy) : undefined,
        buffs: v.buffs
          .filter((b) => b.left !== Infinity || b.state || v.kind === "enemy")
          .map((b) => ({ note: b.src.eff.note, left: b.left === Infinity ? -1 : b.left, stacks: b.stacks, debuff: v.kind === "enemy" })),
        states: v.states.map((st) => st.def.name ?? st.def.id),
        toughness: v.kind === "enemy" ? Math.max(0, v.toughness) : undefined,
        maxToughness: v.kind === "enemy" ? v.maxToughness : undefined,
        broken: v.kind === "enemy" ? v.broken : undefined,
        banger: v.banger?.v,
        dots: v.kind === "enemy" ? v.dots.length : undefined,
      };
    }),
  });

  /** Ultimates: energy-based (auto) or every N turns (manual), cast right after the current action. */
  const checkUlts = () => {
    for (const u of chars) {
      const pol = u.cfg?.ult ?? null;
      if (pol === 0) continue;
      if (pol === null) {
        if (canUlt(u)) castUlt(u);
      } else if (u.turns >= 1 && u.turns - u.ultTurn >= pol && !u.states.some((s) => s.def.blockUlt)) {
        castUlt(u);
      }
    }
  };

  const drain = () => {
    for (let i = 0; i < 200 && queue.length; i++) queue.shift()!();
    checkUlts();
    for (let i = 0; i < 200 && queue.length; i++) {
      queue.shift()!();
      checkUlts();
    }
  };

  const chooseAction = (u: U) => {
    const forced = u.states.find((s) => s.def.force)?.def.force;
    if (forced) return forced;
    const every = u.cfg?.skillEvery ?? (u.kit?.prefer === "basic" ? 0 : 1);
    const wantSkill = every > 0 && (u.turns - 1) % every === 0;
    if (wantSkill) {
      const [, a] = actionOf(u, "skill");
      const cost = a && a.sp && a.sp < 0 ? -a.sp : a ? 0 : 1;
      if (sp >= cost) return "skill";
    }
    return "basic";
  };

  const extraTurn = (u: U, name?: string) => {
    if (u.kind !== "char") return;
    const action = name ?? chooseAction(u);
    const ev = turnEvent(u, action, "extra", false, true);
    const prev = current;
    current = ev;
    const type = doAction(u, action);
    ev.type = type ?? action;
    current = prev;
  };

  const ahaInstant = (fixed: number | null, by: U | null = null) => {
    const ev = turnEvent(aha, "aha", "aha", false, fixed !== null);
    const prev = current;
    current = ev;
    const used = fixed ?? punch;
    ahaPunch = used;
    ahaExtraBy = fixed !== null ? by : null;
    const parts = chars.filter((u) => u.kind === "char" && actionOf(u, "elation")[1]).sort((a, b) => Number(a.key) - Number(b.key));
    for (const u of parts) doAction(u, "elation", { amount: used });
    ahaPunch = null;
    ahaExtraBy = null;
    if (fixed === null) {
      for (const u of parts) u.banger = { v: Math.max(used, u.banger?.v ?? 0), left: Math.max(2, u.banger?.left ?? 0) };
      punch = elationCount;
      aha.ahaBonus = 0;
      aha.d = GAUGE;
    }
    fire("aha", aha, { amount: used });
    current = prev;
  };

  // ----- Battle start -----

  for (const u of chars) {
    for (const s of u.sources) {
      if (s.eff.on !== "passive" || !s.on) continue;
      if (s.eff.stat) for (const x of targets(u, s.eff.to, { owner: u })) addBuff(u, x, s);
      else apply(u, s, { owner: u });
    }
  }
  for (const u of chars) {
    actor = null;
    for (const s of u.sources) if (s.eff.on === "start") apply(u, s, { owner: u });
  }
  drain();

  // ----- Main loop -----

  for (let guardN = 0; guardN < 4000; guardN++) {
    const units = allUnits();
    let u = units[0];
    let best = Infinity;
    for (const v of units) {
      if (v.kind === "char" && v.states.some((s) => s.def.skipTurns) && v.countdown === null) continue;
      const w = v.d / spdOf(v);
      if (w < best - 1e-9) {
        best = w;
        u = v;
      }
    }
    if (!units.length || t + best > end + 1e-9) break;
    const speeds = units.map(spdOf);
    units.forEach((v, i) => (v.d = Math.max(0, v.d - speeds[i] * best)));
    t += best;
    u.d = 0;

    if (u.kind === "aha") {
      ahaInstant(null);
      drain();
      continue;
    }

    if (u.kind === "enemy") {
      // Turn start: recover from break, DoTs tick
      if (u.broken) {
        u.broken = false;
        u.toughness = u.maxToughness;
      }
      for (const d of [...u.dots]) {
        tickDot(u, d);
        d.left--;
      }
      u.dots = u.dots.filter((d) => d.left > 0);
      fire("enemyTurn", u, { enemy: u });
      // Debuffs on the enemy count its turns
      for (const b of u.buffs) if (b.durOn === "target") b.left--;
      u.buffs = u.buffs.filter((b) => b.left > 0);
      u.d = GAUGE;
      drain();
      continue;
    }

    if (u.kind === "summon") {
      u.turns++;
      const ev = turnEvent(u, u.summonAction ?? "turn", "summon", false);
      current = ev;
      const [, sa] = actionOf(u, u.summonAction ?? "turn");
      const type = doAction(u, u.summonAction ?? "turn", { label: sa?.label ?? u.name });
      ev.type = type ?? "summon";
      current = null;
      u.d = GAUGE;
      drain();
      continue;
    }

    // Character turn
    actor = u;
    turnOwner = u;
    let afterCountdown = false;
    if (u.countdown !== null) {
      u.countdown = null;
      afterCountdown = true;
    }
    for (const v of allUnits()) {
      for (const b of v.buffs) if (b.durOn === "owner" && b.owner === u) b.left--;
      v.buffs = v.buffs.filter((b) => b.left > 0);
    }
    u.firedTurn.clear();
    u.turns++;
    for (const st of [...u.states]) {
      if (st.def.tickOn !== "start") continue;
      st.left--;
      if (st.left <= 0) endState(u, st.def.id);
    }
    fire("turnStart", u);

    const skip = u.states.some((s) => s.def.skipTurns);
    const choice = skip ? null : chooseAction(u);
    const ev = turnEvent(u, choice ?? "skip", choice ?? "skip", false);
    ev.afterCountdown = afterCountdown;
    current = ev;
    if (choice) {
      const type = doAction(u, choice);
      if (type === null) {
        // No damage kit: speed effects still fire, skill points still move
        if (choice === "skill") sp = Math.max(0, sp - 1);
        else sp = Math.min(spMax, sp + 1);
        fire(choice, u);
        u.energy = Math.min(u.maxEnergy, u.energy + (choice === "skill" ? 30 : 20) * errOf(u));
      }
      ev.type = type ?? choice;
    }
    // Follow-ups triggered during the turn resolve before it ends (1-turn buffs still apply)
    for (let i = 0; i < 200 && queue.length; i++) queue.shift()!();
    fire("turnEnd", u);
    turnOwner = null;

    // Buffs on the actor that count its own turns
    for (const b of u.buffs) {
      if (b.durOn !== "target") continue;
      if (b.fresh) b.fresh = false;
      else b.left--;
    }
    u.buffs = u.buffs.filter((b) => b.left > 0);
    for (const b of u.pending) {
      b.fresh = false;
      const i = u.buffs.findIndex((x) => x.id === b.id);
      if (i >= 0) u.buffs[i] = b;
      else u.buffs.push(b);
    }
    u.pending = [];
    if (u.banger) {
      u.banger.left--;
      if (u.banger.left <= 0) u.banger = null;
    }
    for (const st of [...u.states]) {
      if (st.def.tickOn === "start") continue;
      if (st.fresh) {
        st.fresh = false;
        continue;
      }
      st.left--;
      if (st.left <= 0) endState(u, st.def.id);
    }

    u.d = GAUGE * (1 - u.next);
    u.next = 0;
    actor = null;
    drain();
    current = null;
  }

  const sources: Record<string, Source[]> = {};
  for (const u of chars) sources[u.key] = u.sources;
  return {
    turns,
    damage,
    end,
    sources,
    noKit: chars.filter((u) => !u.kit).map((u) => u.key),
    log,
  };
}

/** Damage summary per character. */
export function damageByChar(r: BattleResult) {
  const out = new Map<string, { total: number; byType: Record<string, number>; byAction: Record<string, number> }>();
  for (const d of r.damage) {
    const s = out.get(d.key) ?? { total: 0, byType: {}, byAction: {} };
    s.total += d.amount;
    s.byType[d.type] = (s.byType[d.type] ?? 0) + d.amount;
    s.byAction[d.action] = (s.byAction[d.action] ?? 0) + d.amount;
    out.set(d.key, s);
  }
  return out;
}
