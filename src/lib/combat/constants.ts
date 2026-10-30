// Fixed combat numbers (Honkai: Star Rail wiki: Damage, Toughness, Elation DMG pages).

/** Elation DMG level multiplier, index = character level − 1 */
export const ELATION_LEVEL = [
  108, 116, 124, 135.05276, 141.0188, 147.04564, 153.1321, 159.27693, 165.47893, 171.73688, 182.98882, 194.13596,
  205.17833, 216.11589, 226.94867, 237.67665, 248.29984, 258.81824, 269.23184, 279.54068, 298.66458, 317.60223,
  336.35364, 354.9188, 373.2977, 391.49036, 409.49677, 427.31693, 444.9508, 462.39847, 492.85513, 522.36194,
  550.94666, 578.6358, 605.45496, 631.4288, 656.58093, 680.93427, 704.51074, 727.3316, 816.248, 903.5766, 989.35956,
  1073.6376, 1156.4498, 1237.8344, 1317.8276, 1396.4651, 1473.781, 1549.8082, 1742.1199, 1929.7411, 2112.8413,
  2291.582, 2466.117, 2636.593, 2803.1501, 2965.9216, 3125.0356, 3280.6135, 3504.643, 3723.8022, 3938.2483, 4148.132,
  4353.5967, 4554.781, 4751.817, 4944.832, 5133.9478, 5319.2812, 5560.609, 5797.2046, 6029.206, 6256.746, 6479.9517,
  6698.9463, 6913.847, 7124.7686, 7331.82, 7535.107,
];

export function elationLevelMult(level: number) {
  return ELATION_LEVEL[Math.max(1, Math.min(ELATION_LEVEL.length, Math.round(level))) - 1];
}

/**
 * Break DMG level multiplier. 3767.5533 at Lv.80; other levels use half the Elation table,
 * which the wiki gives as roughly the same curve.
 */
export function breakLevelMult(level: number) {
  if (Math.round(level) >= 80) return 3767.5533;
  return elationLevelMult(level) / 2;
}

/** Break base DMG factor by element */
export const BREAK_FACTOR: Record<string, number> = {
  Physical: 2,
  Fire: 2,
  Ice: 1,
  Thunder: 1,
  Wind: 1.5,
  Quantum: 0.5,
  Imaginary: 0.5,
};

export const GAUGE = 10000;
export const FIRST_CYCLE = 150;
export const CYCLE = 100;
export const MAX_SP = 5;
export const START_SP = 3;
