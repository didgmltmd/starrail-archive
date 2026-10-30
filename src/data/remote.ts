// Keeps game data and recommended builds fresh without an app update.
// A daily GitHub Action (.github/workflows/data.yml) regenerates the JSON files in the repo;
// the app downloads them at startup, caches them, and falls back to the bundled copy offline.
import { applyRemoteBuilds } from "./builds";
import { game } from "./game";
import { applyRemoteMeta, type Meta } from "./meta";
import { applyRemoteDmgKits, type DmgKits } from "./dmgkits";
import { applyRemoteSkills, type SkillsData } from "./skills";
import { applyRemoteSpeedKits, type SpeedKits } from "./speedkits";

const BASE = "https://raw.githubusercontent.com/didgmltmd/starrail-archive/master/src/data/";
const FILES = ["game.json", "builds.json", "meta.json", "speedkits.json", "skills.json", "dmgkits.json"] as const;
const CACHE_PREFIX = "sra.data.";

type GameData = typeof game;

function apply(file: (typeof FILES)[number], data: unknown) {
  if (file === "game.json") {
    const g = data as Partial<GameData>;
    if (!g?.characters) return false;
    for (const k of Object.keys(game) as (keyof GameData)[]) {
      if (g[k]) Object.assign(game[k], g[k]);
    }
    return true;
  }
  if (file === "meta.json") return applyRemoteMeta(data as Meta);
  if (file === "speedkits.json") return applyRemoteSpeedKits(data as SpeedKits);
  if (file === "skills.json") return applyRemoteSkills(data as SkillsData);
  if (file === "dmgkits.json") return applyRemoteDmgKits(data as DmgKits);
  const b = data as { builds?: Record<string, unknown> };
  if (!b?.builds) return false;
  applyRemoteBuilds(b.builds);
  return true;
}

function fromCache() {
  for (const f of FILES) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + f);
      if (raw) apply(f, JSON.parse(raw));
    } catch {
      // ignore broken cache
    }
  }
}

async function download(f: (typeof FILES)[number], signal: AbortSignal) {
  const res = await fetch(BASE + f, { signal, cache: "no-cache" });
  if (!res.ok) return;
  const text = await res.text();
  const data = JSON.parse(text);
  if (apply(f, data)) {
    try {
      localStorage.setItem(CACHE_PREFIX + f, text);
    } catch {
      // storage full: still applied for this session
    }
  }
}

/**
 * Applies the cached copy right away, then tries to download a newer one.
 * Waits at most `timeoutMs` so startup is never blocked for long.
 */
export async function refreshGameData(timeoutMs = 2500) {
  fromCache();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await Promise.all(FILES.map((f) => download(f, ctrl.signal).catch(() => {})));
  } finally {
    clearTimeout(timer);
  }
}
