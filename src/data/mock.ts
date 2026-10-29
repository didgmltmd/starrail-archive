// Sample account used until HoYoLAB linking is in place.
import type { Account, OwnedCharacter, Relic, RelicSlot, StatKey, SubStat } from "../types";

// 5-star relic main stat values at +15
const MAIN_MAX: Partial<Record<StatKey, number>> = {
  HP: 705.6,
  ATK: 352.8,
  HP_P: 0.432,
  ATK_P: 0.432,
  DEF_P: 0.54,
  CR: 0.324,
  CD: 0.648,
  OHB: 0.3456,
  EHR: 0.432,
  SPD: 25.032,
  BE: 0.648,
  ERR: 0.1944,
  Physical_DMG: 0.3888,
  Fire_DMG: 0.3888,
  Ice_DMG: 0.3888,
  Thunder_DMG: 0.3888,
  Wind_DMG: 0.3888,
  Quantum_DMG: 0.3888,
  Imaginary_DMG: 0.3888,
};

// 5-star sub stat roll values: low / mid / high
const SUB_ROLL: Partial<Record<StatKey, [number, number, number]>> = {
  HP: [33.87, 38.1, 42.34],
  ATK: [16.94, 19.05, 21.17],
  DEF: [16.94, 19.05, 21.17],
  HP_P: [0.03456, 0.03888, 0.0432],
  ATK_P: [0.03456, 0.03888, 0.0432],
  DEF_P: [0.0432, 0.0486, 0.054],
  SPD: [2.0, 2.3, 2.6],
  CR: [0.02592, 0.02916, 0.0324],
  CD: [0.05184, 0.05832, 0.0648],
  EHR: [0.03456, 0.03888, 0.0432],
  RES: [0.03456, 0.03888, 0.0432],
  BE: [0.05184, 0.05832, 0.0648],
};
const SUB_POOL = Object.keys(SUB_ROLL) as StatKey[];

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface BuildSpec {
  id: string;
  level?: number;
  eidolon?: number;
  lc?: [string, number];
  cavern: [string, string?];
  planar: string;
  body: StatKey;
  feet: StatKey;
  sphere: StatKey;
  rope: StatKey;
  /** Sub stats this character likes; used to bias rolls so some relics come out good. */
  wants: StatKey[];
  /** 0..1, how lucky the rolls are */
  luck: number;
}

function makeRelic(rand: () => number, setId: string, slot: RelicSlot, main: StatKey, spec: BuildSpec): Relic {
  const subs: SubStat[] = [];
  const pool = SUB_POOL.filter((k) => k !== main);
  while (subs.length < 4) {
    const wanted = pool.filter((k) => spec.wants.includes(k) && !subs.some((s) => s.key === k));
    const any = pool.filter((k) => !subs.some((s) => s.key === k));
    const from = wanted.length && rand() < spec.luck * 0.8 ? wanted : any;
    const key = from[Math.floor(rand() * from.length)];
    subs.push({ key, value: 0, rolls: 1 });
  }
  for (let i = 0; i < 5; i++) {
    const good = subs.filter((s) => spec.wants.includes(s.key));
    const target = good.length && rand() < spec.luck ? good : subs;
    target[Math.floor(rand() * target.length)].rolls++;
  }
  for (const s of subs) {
    const r = SUB_ROLL[s.key]!;
    for (let i = 0; i < s.rolls; i++) s.value += r[Math.floor(rand() * 3)];
  }
  return { setId, slot, rarity: 5, level: 15, main: { key: main, value: MAIN_MAX[main]! }, subs };
}

function build(spec: BuildSpec, seed: number): OwnedCharacter {
  const rand = rng(seed);
  const [a, b] = spec.cavern;
  const relics: Relic[] = [
    makeRelic(rand, a, "HEAD", "HP", spec),
    makeRelic(rand, a, "HAND", "ATK", spec),
    makeRelic(rand, b ?? a, "BODY", spec.body, spec),
    makeRelic(rand, b ?? a, "FOOT", spec.feet, spec),
    makeRelic(rand, spec.planar, "NECK", spec.sphere, spec),
    makeRelic(rand, spec.planar, "OBJECT", spec.rope, spec),
  ];
  return {
    id: spec.id,
    level: spec.level ?? 80,
    eidolon: spec.eidolon ?? 0,
    lightCone: spec.lc ? { id: spec.lc[0], level: 80, superimposition: spec.lc[1] } : undefined,
    relics,
  };
}

const CRIT: StatKey[] = ["CR", "CD", "ATK_P", "SPD"];

const SPECS: BuildSpec[] = [
  { id: "1308", eidolon: 2, lc: ["23024", 1], cavern: ["117"], planar: "314", body: "CR", feet: "ATK_P", sphere: "Thunder_DMG", rope: "ATK_P", wants: CRIT, luck: 0.85 },
  { id: "1310", eidolon: 1, lc: ["23025", 1], cavern: ["119"], planar: "316", body: "ATK_P", feet: "SPD", sphere: "ATK_P", rope: "BE", wants: ["BE", "SPD", "ATK_P"], luck: 0.8 },
  { id: "1102", eidolon: 0, lc: ["23001", 1], cavern: ["108"], planar: "309", body: "CR", feet: "SPD", sphere: "Quantum_DMG", rope: "ATK_P", wants: CRIT, luck: 0.55 },
  { id: "1212", eidolon: 0, lc: ["23014", 1], cavern: ["122"], planar: "309", body: "CD", feet: "SPD", sphere: "Ice_DMG", rope: "ATK_P", wants: CRIT, luck: 0.7 },
  { id: "1205", eidolon: 1, lc: ["23009", 1], cavern: ["113"], planar: "309", body: "CR", feet: "HP_P", sphere: "Wind_DMG", rope: "HP_P", wants: ["CR", "CD", "HP_P", "SPD"], luck: 0.4 },
  { id: "1005", eidolon: 0, lc: ["23006", 1], cavern: ["116"], planar: "311", body: "ATK_P", feet: "SPD", sphere: "Thunder_DMG", rope: "ATK_P", wants: ["ATK_P", "SPD", "EHR"], luck: 0.6 },
  { id: "1307", eidolon: 0, lc: ["21001", 5], cavern: ["116"], planar: "303", body: "EHR", feet: "SPD", sphere: "ATK_P", rope: "ATK_P", wants: ["ATK_P", "SPD", "EHR"], luck: 0.5 },
  { id: "1306", eidolon: 0, lc: ["23021", 1], cavern: ["114"], planar: "310", body: "CD", feet: "SPD", sphere: "HP_P", rope: "ERR", wants: ["CD", "SPD", "HP_P"], luck: 0.75 },
  { id: "1309", eidolon: 0, lc: ["21025", 5], cavern: ["102"], planar: "324", body: "ATK_P", feet: "ATK_P", sphere: "ATK_P", rope: "ERR", wants: ["ATK_P", "SPD"], luck: 0.45 },
  { id: "1304", eidolon: 0, lc: ["23023", 1], cavern: ["103"], planar: "310", body: "DEF_P", feet: "SPD", sphere: "DEF_P", rope: "DEF_P", wants: ["DEF_P", "SPD", "RES"], luck: 0.65 },
  { id: "1203", eidolon: 0, lc: ["21000", 5], cavern: ["101"], planar: "302", body: "OHB", feet: "SPD", sphere: "ATK_P", rope: "ERR", wants: ["ATK_P", "SPD", "RES"], luck: 0.35 },
  { id: "1401", eidolon: 0, lc: ["23037", 1], cavern: ["122"], planar: "314", body: "CR", feet: "SPD", sphere: "Ice_DMG", rope: "ATK_P", wants: CRIT, luck: 0.7 },
  { id: "1402", eidolon: 0, lc: ["23036", 1], cavern: ["123"], planar: "309", body: "CR", feet: "SPD", sphere: "Thunder_DMG", rope: "ATK_P", wants: CRIT, luck: 0.6 },
  { id: "1101", eidolon: 0, lc: ["23003", 1], cavern: ["114"], planar: "310", body: "CD", feet: "SPD", sphere: "HP_P", rope: "ERR", wants: ["CD", "SPD", "RES"], luck: 0.5 },
  { id: "1006", eidolon: 6, lc: ["21008", 5], cavern: ["116"], planar: "303", body: "EHR", feet: "SPD", sphere: "ATK_P", rope: "ERR", wants: ["EHR", "SPD"], luck: 0.5 },
  { id: "1001", eidolon: 6, lc: ["21002", 5], cavern: ["103"], planar: "310", body: "DEF_P", feet: "SPD", sphere: "DEF_P", rope: "ERR", wants: ["DEF_P", "SPD", "RES"], luck: 0.4 },
  { id: "1206", level: 70, eidolon: 4, lc: ["21005", 3], cavern: ["105"], planar: "307", body: "CR", feet: "SPD", sphere: "Physical_DMG", rope: "ATK_P", wants: CRIT, luck: 0.3 },
  { id: "8002", eidolon: 3, lc: ["21012", 5], cavern: ["105"], planar: "309", body: "CR", feet: "SPD", sphere: "Physical_DMG", rope: "ATK_P", wants: CRIT, luck: 0.3 },
];

export const mockAccount: Account = {
  uid: "800000001",
  nickname: "개척자",
  level: 70,
  avatarId: "1308",
  signature: "성유물 파밍은 오늘도 계속된다",
  characters: SPECS.map((s, i) => build(s, 1000 + i * 37)),
  updatedAt: new Date().toISOString(),
  source: "sample",
};
