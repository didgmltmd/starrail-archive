// Recommended build per character: sub stat weights, main stats, relic / ornament sets.
// Base data comes from hsr-optimizer (builds.json, regenerate with `pnpm sync:builds`).
// Older characters have no recommended sets there, so those are filled from the curated table below.
import raw from "./builds.json";
import { game } from "./game";
import type { ElementId, StatKey } from "../types";

export type MainSlot = "BODY" | "FOOT" | "NECK" | "OBJECT";

export interface Build {
  /** Sub stat weights, 0..1. Missing = 0. */
  weights: Partial<Record<StatKey, number>>;
  /** Acceptable main stats per slot, best first. Empty or missing = anything is fine. */
  mains: Partial<Record<MainSlot, StatKey[]>>;
  /** Cavern set options, best first. [a, a] = 4-piece a, [a, b] = 2 + 2. */
  relicSets: [string, string][];
  /** Planar ornament options, best first. */
  ornamentSets: string[];
  /** Where weights / main stats came from */
  source: "hsr-optimizer" | "curated" | "fallback";
  /** Where the set recommendation came from ("none" = unknown, set check is skipped) */
  setsSource: "hsr-optimizer" | "curated" | "none";
}

interface RawBuild {
  weights: Record<string, number>;
  mains: Record<string, string[]>;
  relicSets: string[][];
  ornamentSets: string[];
}

const RAW = (raw as unknown as { builds: Record<string, RawBuild> }).builds;

/** Hand-picked sets for characters hsr-optimizer has no set recommendation for. */
const CURATED_SETS: Record<string, { relic: string[][]; orn: string[] }> = {
  "1001": { relic: [["103", "103"]], orn: ["310", "304"] },
  "1004": { relic: [["112", "112"]], orn: ["303", "301"] },
  "1005": { relic: [["116", "116"], ["109", "109"]], orn: ["311", "303"] },
  "1006": { relic: [["108", "108"]], orn: ["303", "312"] },
  "1009": { relic: [["114", "114"]], orn: ["312", "310"] },
  "1101": { relic: [["121", "121"], ["114", "114"]], orn: ["310", "312"] },
  "1102": { relic: [["108", "108"]], orn: ["314", "309"] },
  "1104": { relic: [["103", "103"]], orn: ["310", "304"] },
  "1105": { relic: [["101", "101"]], orn: ["310", "302"] },
  "1106": { relic: [["110", "110"], ["114", "114"]], orn: ["303", "310"] },
  "1110": { relic: [["114", "114"], ["101", "101"]], orn: ["310", "302"] },
  "1202": { relic: [["114", "114"]], orn: ["302", "312"] },
  "1203": { relic: [["101", "101"], ["114", "114"]], orn: ["310", "302"] },
  "1205": { relic: [["113", "113"]], orn: ["319", "309"] },
  "1207": { relic: [["114", "114"]], orn: ["312", "302"] },
  "1208": { relic: [["113", "113"]], orn: ["310", "302"] },
  "1210": { relic: [["116", "116"]], orn: ["311", "303"] },
  "1211": { relic: [["101", "101"]], orn: ["310", "302"] },
  "1212": { relic: [["122", "122"], ["104", "104"]], orn: ["309", "314"] },
  "1215": { relic: [["114", "114"]], orn: ["310", "312"] },
  "1217": { relic: [["114", "114"], ["101", "101"]], orn: ["310", "302"] },
  "1222": { relic: [["111", "111"]], orn: ["316"] },
  "1301": { relic: [["111", "111"]], orn: ["316", "307"] },
  "1303": { relic: [["111", "111"], ["114", "114"]], orn: ["308", "310"] },
  "1304": { relic: [["103", "103"]], orn: ["310"] },
  "1306": { relic: [["121", "121"], ["114", "114"]], orn: ["310", "312"] },
  "1307": { relic: [["116", "116"]], orn: ["303", "311"] },
  "1309": { relic: [["102", "102"]], orn: ["308", "302"] },
  "1310": { relic: [["119", "119"]], orn: ["316"] },
  "1313": { relic: [["121", "121"]], orn: ["317", "310"] },
  "8003": { relic: [["103", "103"]], orn: ["310"] },
  "8005": { relic: [["111", "111"], ["118", "118"]], orn: ["307", "316"] },
};

type Template = Omit<Build, "relicSets" | "ornamentSets" | "source" | "setsSource">;

/** Rough builds by path for characters with no data at all (new releases before a sync). */
function fallbackFor(path: string, element: ElementId): Template {
  const dmg = `${element}_DMG` as StatKey;
  switch (path) {
    case "Shaman":
      return {
        weights: { SPD: 1, HP_P: 0.5, DEF_P: 0.5, RES: 0.5, BE: 0.5 },
        mains: { BODY: ["HP_P", "DEF_P", "CD"], FOOT: ["SPD"], NECK: ["HP_P", "DEF_P"], OBJECT: ["ERR"] },
      };
    case "Warlock":
      return {
        weights: { SPD: 1, EHR: 1, ATK_P: 0.5 },
        mains: { BODY: ["EHR", "ATK_P"], FOOT: ["SPD"], NECK: ["ATK_P", dmg], OBJECT: ["ATK_P", "ERR"] },
      };
    case "Knight":
      return {
        weights: { DEF_P: 1, SPD: 1, RES: 0.5, HP_P: 0.5 },
        mains: { BODY: ["DEF_P", "HP_P"], FOOT: ["SPD"], NECK: ["DEF_P", "HP_P"], OBJECT: ["DEF_P", "ERR"] },
      };
    case "Priest":
      return {
        weights: { HP_P: 1, SPD: 1, RES: 0.5, ATK_P: 0.5 },
        mains: { BODY: ["OHB", "HP_P"], FOOT: ["SPD"], NECK: ["HP_P"], OBJECT: ["ERR", "HP_P"] },
      };
    case "Memory":
      return {
        weights: { CR: 1, CD: 1, SPD: 1, HP_P: 0.5 },
        mains: { BODY: ["CR", "CD"], FOOT: ["SPD"], NECK: [dmg, "HP_P"], OBJECT: ["ERR", "HP_P"] },
      };
    case "Elation":
      return {
        weights: { CR: 1, CD: 1, SPD: 1, ATK_P: 0.5 },
        mains: { BODY: ["CR", "CD"], FOOT: ["SPD", "ATK_P"], NECK: [dmg, "ATK_P"], OBJECT: ["ATK_P", "ERR"] },
      };
    default:
      // Destruction / Hunt / Erudition
      return {
        weights: { CR: 1, CD: 1, ATK_P: 0.75, SPD: 1 },
        mains: { BODY: ["CR", "CD"], FOOT: ["ATK_P", "SPD"], NECK: [dmg, "ATK_P"], OBJECT: ["ATK_P"] },
      };
  }
}

/** Trailblazer forms come in pairs (8001 / 8002 ...) that share a build. */
function canonicalId(id: string) {
  const n = Number(id);
  return n >= 8000 && n < 9000 && n % 2 === 0 ? String(n - 1) : id;
}

const cache = new Map<string, Build>();

export function getBuild(charId: string): Build {
  const hit = cache.get(charId);
  if (hit) return hit;

  const id = canonicalId(charId);
  const r = RAW[id] ?? RAW[charId];
  const curated = CURATED_SETS[id];
  const info = game.characters[charId];

  let build: Build;
  if (r) {
    const hasSets = r.relicSets.length > 0 || r.ornamentSets.length > 0;
    build = {
      weights: r.weights as Build["weights"],
      mains: r.mains as Build["mains"],
      relicSets: (r.relicSets.length ? r.relicSets : (curated?.relic ?? [])) as [string, string][],
      ornamentSets: r.ornamentSets.length ? r.ornamentSets : (curated?.orn ?? []),
      source: "hsr-optimizer",
      setsSource: hasSets ? "hsr-optimizer" : curated ? "curated" : "none",
    };
  } else {
    build = {
      ...fallbackFor(info?.path ?? "", info?.element ?? "Physical"),
      relicSets: (curated?.relic ?? []) as [string, string][],
      ornamentSets: curated?.orn ?? [],
      source: "fallback",
      setsSource: curated ? "curated" : "none",
    };
  }

  cache.set(charId, build);
  return build;
}

/** Replaces the hsr-optimizer data with a newer copy downloaded at startup (see data/remote.ts). */
export function applyRemoteBuilds(builds: Record<string, unknown>) {
  Object.assign(RAW, builds);
  cache.clear();
}
