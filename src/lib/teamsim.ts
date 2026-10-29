// Turn order simulator. Uses the game's action value rules:
//  - a unit acts every 10000 / SPD action value (AV)
//  - in end-game modes the first cycle lasts 150 AV, every later cycle 100 AV
// Kit effects such as action advance are not modelled; they can be approximated with the SPD bonus.

export const FIRST_CYCLE = 150;
export const CYCLE = 100;

export interface SimUnit {
  key: string;
  spd: number;
}

export interface Action {
  key: string;
  /** Action value at which the unit acts */
  av: number;
  /** 1-based action count of this unit */
  n: number;
  cycle: number;
}

/** Action value at which cycle `c` ends (cycle 0 ends at 150). */
export function cycleEnd(c: number) {
  return FIRST_CYCLE + CYCLE * c;
}

export function cycleOf(av: number) {
  if (av <= FIRST_CYCLE) return 0;
  return Math.ceil((av - FIRST_CYCLE) / CYCLE);
}

/** All actions until the end of cycle `cycles - 1`, in turn order (ties keep slot order). */
export function simulate(units: SimUnit[], cycles: number): Action[] {
  const end = cycleEnd(cycles - 1);
  const out: Action[] = [];
  units.forEach((u) => {
    if (!(u.spd > 0)) return;
    const step = 10000 / u.spd;
    for (let n = 1; n * step <= end + 1e-9; n++) {
      const av = n * step;
      out.push({ key: u.key, av, n, cycle: cycleOf(av - 1e-9) });
    }
  });
  const order = new Map(units.map((u, i) => [u.key, i]));
  return out.sort((a, b) => a.av - b.av || order.get(a.key)! - order.get(b.key)!);
}

/** Actions of one unit per cycle. */
export function perCycle(actions: Action[], key: string, cycles: number) {
  const counts = Array.from({ length: cycles }, () => 0);
  for (const a of actions) if (a.key === key && a.cycle < cycles) counts[a.cycle]++;
  return counts;
}

/** Lowest SPD that gives `actions` actions by the end of cycle `cycle`. */
export function spdFor(actions: number, cycle: number) {
  return (actions * 10000) / cycleEnd(cycle);
}

/**
 * Next useful SPD for a unit: the smallest increase that adds one action within the shown cycles,
 * checked for every cycle boundary, so the result is the cheapest breakpoint.
 */
export function nextBreakpoint(spd: number, cycles: number) {
  let best: { spd: number; cycle: number; actions: number } | null = null;
  for (let c = 0; c < cycles; c++) {
    const have = Math.floor((cycleEnd(c) * spd) / 10000 + 1e-9);
    const need = spdFor(have + 1, c);
    if (!best || need < best.spd) best = { spd: need, cycle: c, actions: have + 1 };
  }
  return best;
}

/** Well-known breakpoints for the first cycles, for the reference table. */
export const BREAKPOINTS = [
  { spd: spdFor(2, 0), label: "0사이클 2회 행동" },
  { spd: spdFor(3, 1), label: "1사이클까지 3회 행동" },
  { spd: spdFor(4, 1), label: "1사이클까지 4회 행동" },
  { spd: spdFor(5, 2), label: "2사이클까지 5회 행동" },
  { spd: spdFor(6, 2), label: "2사이클까지 6회 행동" },
];
