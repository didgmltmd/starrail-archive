// Account data as the app uses it. HoYoLAB responses get mapped into these shapes.

export type ElementId = "Physical" | "Fire" | "Ice" | "Thunder" | "Wind" | "Quantum" | "Imaginary";

export type StatKey =
  | "HP"
  | "ATK"
  | "DEF"
  | "SPD"
  | "HP_P"
  | "ATK_P"
  | "DEF_P"
  | "CR"
  | "CD"
  | "BE"
  | "OHB"
  | "ERR"
  | "EHR"
  | "RES"
  | `${ElementId}_DMG`;

/** Percent stats are stored as ratios (0.648 = 64.8%). */
export interface Stat {
  key: StatKey;
  value: number;
}

export interface SubStat extends Stat {
  /** Number of rolls that landed on this sub stat (1 = initial only). */
  rolls: number;
}

export type CavernSlot = "HEAD" | "HAND" | "BODY" | "FOOT";
export type PlanarSlot = "NECK" | "OBJECT";
export type RelicSlot = CavernSlot | PlanarSlot;

export interface Relic {
  setId: string;
  slot: RelicSlot;
  rarity: number;
  level: number;
  main: Stat;
  subs: SubStat[];
}

export interface OwnedLightCone {
  id: string;
  level: number;
  superimposition: number;
}

/** One line of the stats panel: base value and bonus on top. Percent stats are ratios. */
export interface StatLine {
  key: StatKey;
  base: number;
  bonus: number;
}

export interface OwnedCharacter {
  id: string;
  level: number;
  eidolon: number;
  lightCone?: OwnedLightCone;
  relics: Relic[];
  /** Final in-game stats (HoYoLAB provides these, including traces). Computed when missing. */
  finalStats?: StatLine[];
}

export type ChallengeKind = "moc" | "pf" | "as";

export interface ChallengeTeam {
  avatars: { id: string; level: number; eidolon: number }[];
  /** Pure Fiction / Apocalyptic Shadow score */
  score?: number;
  bossDefeated?: boolean;
  buff?: { name: string; desc: string };
}

export interface ChallengeFloor {
  name: string;
  stars: number;
  /** Memory of Chaos cycles used */
  rounds?: number;
  fast: boolean;
  teams: ChallengeTeam[];
}

export interface ChallengePeriod {
  kind: ChallengeKind;
  name: string;
  /** ISO local time */
  begin: string;
  end: string;
  status: string;
  stars: number;
  battles: number;
  maxFloor: string;
  hasData: boolean;
  floors: ChallengeFloor[];
  /** Apocalyptic Shadow bosses */
  bosses: string[];
  /** Boss portraits (same order as bosses), when HoYoLAB provides them */
  bossIcons?: string[];
}

export interface ChallengeRecords {
  current: Partial<Record<ChallengeKind, ChallengePeriod>>;
  previous: Partial<Record<ChallengeKind, ChallengePeriod>>;
}

export interface Account {
  uid: string;
  nickname: string;
  level: number;
  avatarId: string;
  signature: string;
  characters: OwnedCharacter[];
  /** ISO time of the last successful sync with HoYoLAB */
  updatedAt: string;
  /** "hoyolab" for linked data, "sample" for the built-in demo account */
  source?: "hoyolab" | "sample";
  /** End-game records (current and previous period) */
  challenges?: ChallengeRecords;
}
