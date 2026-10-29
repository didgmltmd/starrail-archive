// Weekly researched meta (rotations, recommended teams, 이잘키 benchmarks, team-specific builds).
// Written by the research routine (docs/META_RESEARCH.md); every item carries its sources.
import raw from "./meta.json";
import type { ChallengeKind, ElementId, StatKey } from "../types";
import type { MainSlot } from "./builds";

export interface Source {
  title: string;
  url: string;
  checked: string;
}

export interface RotationSide {
  label: string;
  weaknesses?: ElementId[];
  enemies?: string[];
}

export interface Rotation {
  name: string;
  begin?: string;
  end?: string;
  summary?: string;
  sides?: RotationSide[];
  sources: Source[];
}

export interface MetaTeam {
  id: string;
  name: string;
  members: string[];
  alternatives?: Record<string, string[]>;
  modes?: ChallengeKind[];
  note?: string;
  sources: Source[];
}

export interface Benchmark {
  stats: Partial<Record<StatKey, number>>;
  eidolon?: number;
  note?: string;
  sources: Source[];
}

export interface TeamBuild {
  charId: string;
  when: string;
  relicSets?: [string, string][];
  ornamentSets?: string[];
  mains?: Partial<Record<MainSlot, StatKey[]>>;
  note?: string;
  sources: Source[];
}

export interface BuildPriority {
  charId: string;
  modes?: ChallengeKind[];
  reason: string;
  sources: Source[];
}

export interface Meta {
  version: number;
  updatedAt: string;
  gameVersion?: string;
  notes?: string[];
  rotations: Partial<Record<ChallengeKind, Rotation>>;
  teams: MetaTeam[];
  benchmarks: Record<string, Benchmark>;
  teamBuilds: TeamBuild[];
  buildPriority: BuildPriority[];
}

/** Mutable so a newer copy downloaded at startup can replace it (see data/remote.ts). */
export const meta: Meta = { ...(raw as unknown as Meta) };

export function applyRemoteMeta(next: Meta) {
  if (next?.version !== 1) return false;
  // Keep the newer of the bundled and downloaded copies
  if ((next.updatedAt ?? "") < (meta.updatedAt ?? "")) return true;
  Object.assign(meta, next);
  return true;
}

export const hasMeta = () =>
  Object.keys(meta.rotations ?? {}).length > 0 || (meta.teams ?? []).length > 0 || Object.keys(meta.benchmarks ?? {}).length > 0;
