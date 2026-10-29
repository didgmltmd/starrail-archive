// Speed-related kit effects (action advance, SPD buffs) used by the team speed simulator.
// Bundled copy here; the weekly research routine keeps the repo copy current and the app
// downloads it at startup (see remote.ts).
import raw from "./speedkits.json";

export type Trigger = "start" | "passive" | "skill" | "basic" | "ult";
/** self, the chosen single ally, everyone, everyone else, or party members of a path ("path:Mage") */
export type Target = "self" | "ally" | "team" | "others" | `path:${string}`;
export type Kind = "advance" | "nextAdvance" | "spdPct" | "spdFlat" | "spdOfCaster" | "countdown" | "advanceByElation" | "ahaExtraTurn" | "ahaSpdPerAllyAttack";

export interface SpeedEffect {
  on: Trigger;
  to: Target;
  kind: Kind;
  /** One number, or one per superimposition (light cones) / per Elation count (Pearl) */
  value: number | number[];
  /** Turns the buff lasts */
  dur?: number;
  /** Whose turns count down the buff: the holder's (default) or the caster's */
  durOn?: "target" | "owner";
  /** Buff starts after the target's next action */
  after?: boolean;
  /** Eidolon needed */
  rank?: number;
  /** Only the first time */
  once?: boolean;
  /** Not applied when the target has this path */
  notPath?: string;
  /** Relic set pieces needed */
  pieces?: number;
  /** Final SPD needed */
  minSpd?: number;
  /** Wearer's path needed (relic sets) */
  path?: string;
  note: string;
}

export interface SpeedKits {
  version: number;
  updatedAt: string;
  notes?: string[];
  characters: Record<string, SpeedEffect[]>;
  lightCones: Record<string, SpeedEffect[]>;
  relicSets: Record<string, SpeedEffect[]>;
}

export const speedKits = raw as unknown as SpeedKits;

export function applyRemoteSpeedKits(data: SpeedKits) {
  if (data?.version !== 1 || !data.characters) return false;
  speedKits.characters = data.characters;
  speedKits.lightCones = data.lightCones ?? {};
  speedKits.relicSets = data.relicSets ?? {};
  speedKits.updatedAt = data.updatedAt;
  return true;
}
