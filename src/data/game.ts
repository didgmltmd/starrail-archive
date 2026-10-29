import raw from "./game.json";
import type { ElementId, RelicSlot, StatKey } from "../types";

export interface CharacterInfo {
  id: string;
  name: string;
  rarity: number;
  path: string;
  element: ElementId;
  /** Energy needed for the ultimate */
  energy?: number;
  icon: string;
  preview: string;
  portrait: string;
  base?: { hp: number; atk: number; def: number; spd: number; crit_rate: number; crit_dmg: number };
}

export interface LightConeInfo {
  id: string;
  name: string;
  rarity: number;
  path: string;
  icon: string;
  preview: string;
  portrait: string;
  base?: { hp: number; atk: number; def: number };
}

export interface RelicSetInfo {
  id: string;
  name: string;
  desc: string[];
  planar: boolean;
  icon: string;
  pieces: Partial<Record<RelicSlot, string>>;
}

interface GameData {
  characters: Record<string, CharacterInfo>;
  lightCones: Record<string, LightConeInfo>;
  relicSets: Record<string, RelicSetInfo>;
  paths: Record<string, { id: string; name: string; text: string; icon: string }>;
  elements: Record<string, { id: string; name: string; color: string; icon: string }>;
}

export const game = raw as unknown as GameData;

// jsDelivr refuses some files from this repo (403), so images come straight from GitHub.
const CDN = "https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/";
export const asset = (path: string) => CDN + path;

export const ELEMENT_COLORS: Record<ElementId, string> = {
  Physical: "#d8d8d8",
  Fire: "#f45b42",
  Ice: "#5cc8f5",
  Thunder: "#c46cf0",
  Wind: "#5fd1a0",
  Quantum: "#7b6cf0",
  Imaginary: "#f2d45c",
};

interface StatDef {
  name: string;
  percent: boolean;
  icon: string;
}

const ELEMENT_DMG = Object.fromEntries(
  (["Physical", "Fire", "Ice", "Thunder", "Wind", "Quantum", "Imaginary"] as ElementId[]).map((e) => [
    `${e}_DMG`,
    {
      name: `${game.elements[e]?.name ?? e} 속성 피해 증가`,
      percent: true,
      icon: `icon/property/Icon${e}AddedRatio.png`,
    },
  ]),
);

export const STATS: Record<StatKey, StatDef> = {
  HP: { name: "HP", percent: false, icon: "icon/property/IconMaxHP.png" },
  ATK: { name: "공격력", percent: false, icon: "icon/property/IconAttack.png" },
  DEF: { name: "방어력", percent: false, icon: "icon/property/IconDefence.png" },
  SPD: { name: "속도", percent: false, icon: "icon/property/IconSpeed.png" },
  HP_P: { name: "HP", percent: true, icon: "icon/property/IconMaxHP.png" },
  ATK_P: { name: "공격력", percent: true, icon: "icon/property/IconAttack.png" },
  DEF_P: { name: "방어력", percent: true, icon: "icon/property/IconDefence.png" },
  CR: { name: "치명타 확률", percent: true, icon: "icon/property/IconCriticalChance.png" },
  CD: { name: "치명타 피해", percent: true, icon: "icon/property/IconCriticalDamage.png" },
  BE: { name: "격파 특수효과", percent: true, icon: "icon/property/IconBreakUp.png" },
  OHB: { name: "치유량 보너스", percent: true, icon: "icon/property/IconHealRatio.png" },
  ERR: { name: "에너지 회복효율", percent: true, icon: "icon/property/IconEnergyRecovery.png" },
  EHR: { name: "효과 명중", percent: true, icon: "icon/property/IconStatusProbability.png" },
  RES: { name: "효과 저항", percent: true, icon: "icon/property/IconStatusResistance.png" },
  ...(ELEMENT_DMG as Record<`${ElementId}_DMG`, StatDef>),
};

export function formatStat(key: StatKey, value: number, digits = 1) {
  if (STATS[key].percent) return `${(value * 100).toFixed(digits)}%`;
  return key === "SPD" ? value.toFixed(digits === 0 ? 0 : 1) : Math.floor(value).toLocaleString();
}

export const SLOT_NAMES: Record<RelicSlot, string> = {
  HEAD: "머리",
  HAND: "손",
  BODY: "몸통",
  FOOT: "신발",
  NECK: "차원 구체",
  OBJECT: "연결 매듭",
};

export const SLOT_ORDER: RelicSlot[] = ["HEAD", "HAND", "BODY", "FOOT", "NECK", "OBJECT"];
