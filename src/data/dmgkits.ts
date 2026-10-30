// Damage kits: how each character, light cone and relic set behaves in battle, written as data.
// Numbers point at the game data (skills.json) wherever the game exposes them, so they follow
// balance changes. The format is documented in docs/DMG_KITS.md; the weekly research routine
// adds new characters and the app downloads the file at startup (see remote.ts).
import raw from "./dmgkits.json";
import type { ElementId, StatKey } from "../types";

export type DmgType =
  | "basic"
  | "skill"
  | "ult"
  | "followup"
  | "dot"
  | "additional"
  | "elation"
  | "memosprite"
  | "summon"
  | "break"
  | "superBreak";

/**
 * When an effect fires, seen from the effect's owner.
 *  passive: always on · start: battle start · turnStart / turnEnd: own turn
 *  basic | skill | ult | followup | elation | memosprite: after an own action of that type
 *  action:<name>: after an own action with that name · attack: after any own attack
 *  allyAttack / allySkill / allyUlt / allyBasic: after another ally's action of that kind
 *  anyAttack / anyUlt: after anyone's (self included)
 *  enemyTurn: an enemy's turn starts · break: any ally breaks an enemy · selfBreak: the owner does
 *  aha: an Aha Instant (Elation) · summon:<id>: after the owner's summon acts
 *  punchline: the team gains Punchline (ev amount) · spSpent: anyone spends skill points (ev amount)
 *  counter:<id>: the owner's counter reached its threshold
 *  before:<type> / before:action:<name> / before:attack: right before the owner's own action's hits
 *    (for "발동 시 이번 공격의 피해 증가": give the buff a short dur or consume)
 */
export type Trigger = string;

/** self · ally (chosen single ally) · team · others · source (who caused the trigger) ·
 *  enemy (main target) · enemies (all) · path:<Path> · element:<Element> · summon:<id> */
export type Target = string;

export type CombatStat =
  | "HP"
  | "HP%"
  | "ATK"
  | "ATK%"
  | "DEF"
  | "DEF%"
  | "SPD"
  | "SPD%"
  | "CR"
  | "CD"
  | "BE"
  | "ERR"
  | "EHR"
  | "OHB"
  | "ELA"
  | "Merrymake"
  /** DMG boost (filter with types / element) */
  | "DMG%"
  | "DEFIgnore"
  | "RESPen"
  /** Adds to the ability multiplier (filter with types) */
  | "multAdd"
  /** Independent multiplier, e.g. "DMG becomes 150%" → 0.5 */
  | "finalMult"
  | "breakDMG%"
  | "superBreakDMG%"
  /** Converts toughness reduction to Super Break DMG at this ratio (needs the enemy broken) */
  | "superBreak"
  | "breakEff"
  /** Enemy side (holder is an enemy) */
  | "DEFDown"
  | "RESDown"
  | "Vuln";

export type Value =
  | number
  /** Skill param at the character's actual skill level */
  | { skill: string; p: number }
  /** Trace param */
  | { tree: string; p: number }
  /** Light cone param at the equipped superimposition */
  | { lc: number }
  /** Current stat of the owner (default), the buff holder or the trigger source.
   *  base: base value only (character + light cone). without: buff ids to leave out. */
  | { stat: CombatStat | StatKey; of?: "owner" | "holder" | "source"; base?: boolean; without?: string[] }
  | { add: Value[] }
  | { mul: Value[] }
  | { sub: [Value, Value] }
  | { div: [Value, Value] }
  /** Amount carried by the trigger (punchline gained, skill points spent, Punchline used by an Elation Skill) */
  | { ev: "amount" }
  /** Max energy of the owner / holder */
  | { maxEnergy: "owner" | "holder" }
  /** Team Punchline now · skill points now · the owner's Certified Banger amount */
  | { punch: "team" }
  | { sp: "team" }
  | { banger: "self" }
  /** 1 when the owner has unlocked this trace point, else 0 */
  | { trace: string }
  /** 1 when the owner has this eidolon, else 0 */
  | { rank: number }
  | { floor: Value }
  /** 1 when a ≥ b, else 0 */
  | { gte: [Value, Value] }
  | { min: Value[] }
  | { max: Value[] }
  /** floor((min(stat, over + max) − over) / per), never below 0 */
  | { steps: { stat: CombatStat; of?: "owner" | "holder"; over: Value; per: Value; max?: Value } }
  /** party members of a path / element, enemies, or team size */
  | { count: string }
  | { counter: string }
  /** pick[by − 1], clamped */
  | { pick: Value[]; by: Value };

export interface Cond {
  /** Main target enemy is weakness broken */
  broken?: boolean;
  stat?: { key: CombatStat; of?: "owner" | "holder"; gte?: Value; lte?: Value };
  count?: { of: string; gte?: number; lte?: number };
  counter?: { id: string; gte?: number; lte?: number };
  state?: string;
  notState?: string;
  /** Debuffs on the main target */
  debuffs?: { gte: number };
  /** Holder (or trigger source) path */
  path?: string;
  notPath?: string;
  /** Owner has the Certified Banger state (Elation) */
  banger?: boolean;
  /** Main target is weak to this element */
  weak?: ElementId;
  /** Holder's max energy (checked per target) */
  maxEnergy?: { gte?: number; lte?: number };
  /** Inside an Aha extra turn granted by the owner (fixed Punchline) */
  ahaExtra?: boolean;
  /** Checked per target, with the target as holder */
  holder?: Cond;
  /** Amount carried by the trigger (for attacks: skill points the attack spent) */
  ev?: { gte?: number; lte?: number };
  /** Checked on the unit that caused the trigger (e.g. { "path": "Hunt" }, { "chosen": true }) */
  source?: Cond;
  /** Holder is the owner's chosen ally */
  chosen?: boolean;
  all?: Cond[];
  any?: Cond[];
}

export type DoKind =
  | "advance"
  | "nextAdvance"
  | "countdown"
  | "energy"
  /** Energy as a ratio of the holder's max energy */
  | "energyPct"
  | "sp"
  /** Raises the skill point cap */
  | "maxSp"
  | "punchline"
  | "banger"
  /** Extends the holder's Certified Banger by N turns */
  | "bangerExtend"
  | "extraTurn"
  | "ahaExtraTurn"
  | "ahaSpd"
  | "action"
  | "counter"
  | "setCounter"
  | "state"
  | "endState"
  /** Gives back uses of a state (ref) */
  | "stateUses"
  /** Removes N stacks of the buff with id `ref` from the targets */
  | "unstack"
  | "dmg"
  | "dot"
  | "detonate"
  | "toughness"
  | "summon";

export interface Hit {
  /** Ability multiplier */
  mult?: Value;
  /** Stat the multiplier scales from (default: the kit's scale, else ATK) */
  scale?: "ATK" | "HP" | "DEF";
  flat?: Value;
  /** single (main target) · blast (main + 2 adjacent) · aoe (all) · bounce (random, `bounces` times) · split (shared by all) */
  area?: "single" | "blast" | "aoe" | "bounce" | "split";
  /** Multiplier on adjacent targets (blast) */
  adjMult?: Value;
  bounces?: Value;
  /** Toughness reduction on the main target (per bounce for bounce).
   *  "auto" takes it from the game data of the action's skill (main / adjacent / all). */
  toughness?: number | "auto";
  adjToughness?: number;
  /** Extra damage types on top of the action's type */
  types?: DmgType[];
  element?: ElementId;
  /** Elation DMG formula (level multiplier based, no DMG boost) */
  elation?: boolean;
  /** Punchline used by Elation DMG: the team's, the attacker's Certified Banger, or a fixed amount */
  punch?: "team" | "banger" | number;
  /** Multiplies the Punchline counted (e.g. "counts 5× Punchline") */
  punchMul?: Value;
  noCrit?: boolean;
  /** Reduces toughness even when the enemy is not weak to the element */
  ignoreWeak?: boolean;
  /** "X% of <element> Break DMG": break formula with this ratio (mult is ignored) */
  breakRatio?: Value;
  /** Caps the max toughness used by breakRatio (e.g. 16 units → 160) */
  maxToughness?: number;
  /** Hit only happens when this holds */
  cond?: Cond;
}

export interface KitEffect {
  on: Trigger;
  to?: Target;
  stat?: CombatStat;
  do?: DoKind;
  value?: Value;
  dur?: Value;
  /** Whose turns count the duration down: the holder's (default) or the owner's */
  durOn?: "target" | "owner";
  /** Gains a stack each time it fires (value is per stack) */
  stack?: number;
  /** Buffs with the same id replace each other */
  id?: string;
  /** Damage filters for damage stats */
  types?: DmgType[];
  element?: ElementId;
  cond?: Cond;
  /** Condition the simulator cannot check; shown to the player as an assumption they can turn off */
  assume?: string;
  rank?: number;
  /** Not applied from this eidolon on (replaced by a stronger version) */
  maxRank?: number;
  /** Bonus ability point id that must be unlocked */
  trace?: string;
  /** Relic set pieces needed */
  pieces?: number;
  /** Probability; scales damage and turns other effects into expected values where possible */
  chance?: Value;
  /** do: dmg / dot — name shown in the damage breakdown (default: note) */
  label?: string;
  limit?: { perTurn?: number; total?: number };
  /** Starts after the holder's next action */
  after?: boolean;
  /** do: energy — fixed amount (고정), not scaled by energy regeneration */
  fixed?: boolean;
  /** Buff is used up by the holder's next action of these types ("attack" = any attack) */
  consume?: (DmgType | "attack")[];
  /** do: action / extraTurn / summon: action name; do: counter: counter id; do: state / endState: state id */
  ref?: string;
  /** do: dmg */
  hits?: Hit[];
  /** do: dot → damage type and ticks */
  /** id: DoTs with the same id replace each other (default: the note); re-applying never shortens it */
  dot?: { mult: Value; scale?: "ATK" | "HP" | "DEF"; element?: ElementId; dur: Value; id?: string };
  note: string;
}

export interface KitAction {
  type: DmgType;
  /** Korean name shown to players for actions other than basic / skill / ult / elation (e.g. "강화 일반 공격", "추가 공격") */
  label?: string;
  /** Skill id this action is; energy and "auto" toughness come from its game data */
  skill?: string;
  hits?: Hit[];
  /** Skill points: +1 gains, −1 spends */
  sp?: number;
  energy?: number;
  punchline?: Value;
  /** Targets an ally instead of enemies (no attack) */
  ally?: boolean;
  /** Effects applied before the hits (debuffs that the same action benefits from) */
  before?: KitEffect[];
  /** Deals damage but does not count as an attack (no attack triggers) */
  notAttack?: boolean;
}

export interface KitState {
  id: string;
  name?: string;
  /** Action names swapped while active, e.g. { "basic": "enhancedBasic" } */
  replace?: Record<string, string>;
  /** Ends after this many replaced actions */
  uses?: number;
  /** Ends after this many owner turns */
  dur?: Value;
  /** Action used on every turn while active (before replacements), e.g. "basic" */
  force?: string;
  /** When the duration counts down: the owner's turn end (default) or turn start */
  tickOn?: "start" | "end";
  blockUlt?: boolean;
  /** Owner skips its turns while active (e.g. counting down) */
  skipTurns?: boolean;
  effects?: KitEffect[];
  onEnd?: KitEffect[];
}

export interface KitSummon {
  id: string;
  name: string;
  spd: Value;
  /** Action from the owner's actions used on each summon turn */
  action: string;
  /** Present from battle start (default) or created by do: summon */
  start?: boolean;
}

export interface CharKit {
  scale?: "ATK" | "HP" | "DEF";
  /** Default per-turn choice */
  prefer?: "skill" | "basic";
  actions: Record<string, KitAction>;
  /** Ultimate paid with a counter instead of energy (keep: only needs it, does not spend it) */
  ultCost?: { counter: string; n: Value; keep?: boolean };
  states?: KitState[];
  /** at: threshold that fires `then`; reset: value after firing; repeat: subtract `at` and fire again for every full step */
  counters?: Record<string, { max?: Value; start?: number; at?: Value; then?: KitEffect[]; reset?: number; repeat?: boolean }>;
  summons?: KitSummon[];
  effects: KitEffect[];
  /** What the kit leaves out, shown to players */
  missing?: string[];
  sources?: string[];
}

export interface ItemKit {
  effects: KitEffect[];
  missing?: string[];
}

export interface DmgKits {
  version: number;
  updatedAt: string;
  notes?: string[];
  characters: Record<string, CharKit>;
  lightCones: Record<string, ItemKit>;
  relicSets: Record<string, ItemKit>;
}

export const dmgKits = raw as unknown as DmgKits;

export function applyRemoteDmgKits(data: DmgKits) {
  if (data?.version !== 1 || !data.characters) return false;
  dmgKits.characters = data.characters;
  dmgKits.lightCones = data.lightCones ?? {};
  dmgKits.relicSets = data.relicSets ?? {};
  dmgKits.updatedAt = data.updatedAt;
  return true;
}
