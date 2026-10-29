import { game } from "../data/game";
import type { OwnedCharacter, StatKey, StatLine } from "../types";

export type { StatLine };

/**
 * Stats for the stats panel. Uses the in-game values from HoYoLAB when available,
 * otherwise estimates them from base stats + light cone + relics (no traces).
 */
export function computeStats(c: OwnedCharacter): StatLine[] {
  if (c.finalStats?.length) return c.finalStats;

  const info = game.characters[c.id];
  const lc = c.lightCone ? game.lightCones[c.lightCone.id] : undefined;
  const sum: Partial<Record<StatKey, number>> = {};
  for (const r of c.relics) {
    for (const s of [r.main, ...r.subs]) sum[s.key] = (sum[s.key] ?? 0) + s.value;
  }
  const v = (k: StatKey) => sum[k] ?? 0;

  const hp = (info.base?.hp ?? 0) + (lc?.base?.hp ?? 0);
  const atk = (info.base?.atk ?? 0) + (lc?.base?.atk ?? 0);
  const def = (info.base?.def ?? 0) + (lc?.base?.def ?? 0);
  const spd = info.base?.spd ?? 100;
  const dmgKey = `${info.element}_DMG` as StatKey;

  return [
    { key: "HP", base: hp, bonus: hp * v("HP_P") + v("HP") },
    { key: "ATK", base: atk, bonus: atk * v("ATK_P") + v("ATK") },
    { key: "DEF", base: def, bonus: def * v("DEF_P") + v("DEF") },
    { key: "SPD", base: spd, bonus: v("SPD") },
    { key: "CR", base: info.base?.crit_rate ?? 0.05, bonus: v("CR") },
    { key: "CD", base: info.base?.crit_dmg ?? 0.5, bonus: v("CD") },
    { key: "BE", base: 0, bonus: v("BE") },
    { key: "OHB", base: 0, bonus: v("OHB") },
    { key: "ERR", base: 1, bonus: v("ERR") },
    { key: "EHR", base: 0, bonus: v("EHR") },
    { key: "RES", base: 0, bonus: v("RES") },
    { key: dmgKey, base: 0, bonus: v(dmgKey) },
  ];
}

/** Total value of one stat (base + bonus), 0 when absent. */
export function statTotal(c: OwnedCharacter, key: StatKey): number {
  const line = computeStats(c).find((l) => l.key === key);
  return line ? line.base + line.bonus : 0;
}
