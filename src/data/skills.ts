// Skill, trace and light cone numbers from the game data (regenerated daily by sync-gamedata).
// Damage kits point at these instead of copying numbers, so balance changes flow in automatically.
import raw from "./skills.json";

export interface SkillData {
  type: string;
  effect?: string;
  /** Trace point that levels this skill (HoYoLAB reports levels per point) */
  point?: string;
  maxLevel?: number;
  /** params[level - 1][index] */
  params: number[][];
  /** Toughness reduction (in-game display units): main target, adjacent, all */
  tough?: { one?: number; spread?: number; all?: number };
  /** Energy gained on use */
  energy?: number;
  /** Ultimate cost */
  need?: number;
}

export interface SkillsData {
  characters: Record<string, { skills: Record<string, SkillData>; traces: Record<string, number[]> }>;
  /** params[superimposition - 1][index] */
  lightCones: Record<string, number[][]>;
}

export const skillData = raw as unknown as SkillsData;

export function applyRemoteSkills(data: SkillsData) {
  if (!data?.characters || !data.lightCones) return false;
  skillData.characters = data.characters;
  skillData.lightCones = data.lightCones;
  return true;
}
