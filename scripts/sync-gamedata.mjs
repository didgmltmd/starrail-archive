// Pulls Korean game data from StarRailRes and writes a trimmed copy to src/data/game.json.
// Run with: pnpm sync:gamedata
import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/index_new/kr";
const OUT = new URL("../src/data/game.json", import.meta.url);
// Skill / trace / light cone numbers used by the damage simulator (dmgkits.json refers to them)
const SKILLS_OUT = new URL("../src/data/skills.json", import.meta.url);

async function load(name) {
  const res = await fetch(`${BASE}/${name}.json`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}

const [characters, lightCones, relicSets, relics, paths, elements, properties, charPromo, lcPromo, skills, trees, lcRanks] =
  await Promise.all(
    [
      "characters",
      "light_cones",
      "relic_sets",
      "relics",
      "paths",
      "elements",
      "properties",
      "character_promotions",
      "light_cone_promotions",
      "character_skills",
      "character_skill_trees",
      "light_cone_ranks",
    ].map(load),
  );

// Stat at Lv.80 (last ascension): base + step * 79
function atMax(promo, keys) {
  const last = promo?.values?.at(-1);
  if (!last) return undefined;
  const r = {};
  for (const k of keys) if (last[k]) r[k] = +(last[k].base + last[k].step * 79).toFixed(4);
  return r;
}

const out = { characters: {}, lightCones: {}, relicSets: {}, paths: {}, elements: {}, properties: {} };

for (const c of Object.values(characters)) {
  out.characters[c.id] = {
    id: c.id,
    name: c.name === "{NICKNAME}" ? "개척자" : c.name,
    rarity: c.rarity,
    path: c.path,
    element: c.element,
    energy: c.max_sp,
    icon: c.icon,
    preview: c.preview,
    portrait: c.portrait,
    base: atMax(charPromo[c.id], ["hp", "atk", "def", "spd", "crit_rate", "crit_dmg"]),
  };
}

for (const l of Object.values(lightCones)) {
  out.lightCones[l.id] = {
    id: l.id,
    name: l.name,
    rarity: l.rarity,
    path: l.path,
    icon: l.icon,
    preview: l.preview,
    portrait: l.portrait,
    base: atMax(lcPromo[l.id], ["hp", "atk", "def"]),
  };
}

// Piece icons per set, taken from the 5-star version of each piece.
const pieces = {};
for (const r of Object.values(relics)) {
  if (r.rarity !== 5) continue;
  (pieces[r.set_id] ??= {})[r.type] = r.icon;
}

for (const s of Object.values(relicSets)) {
  out.relicSets[s.id] = {
    id: s.id,
    name: s.name,
    desc: s.desc,
    planar: Number(s.id) >= 300,
    icon: s.icon,
    pieces: pieces[s.id] ?? {},
  };
}

for (const p of Object.values(paths)) {
  out.paths[p.id] = { id: p.id, name: p.name, text: p.text, icon: p.icon };
}

for (const e of Object.values(elements)) {
  out.elements[e.id] = { id: e.id, name: e.name, color: e.color, icon: e.icon };
}

for (const p of Object.values(properties)) {
  out.properties[p.type] = { type: p.type, name: p.name, percent: p.percent, icon: p.icon };
}

// Numbers only: params[level - 1][index]. Rounded to drop float noise.
const round = (v) => (typeof v === "number" ? +v.toPrecision(10) : v);
const sk = { characters: {}, lightCones: {} };
for (const c of Object.values(characters)) {
  const entry = { skills: {}, traces: {} };
  // Which trace point levels each skill up (HoYoLAB reports levels per point)
  const pointOf = {};
  for (const id of c.skill_trees ?? []) for (const u of trees[id]?.level_up_skills ?? []) pointOf[u.id] ??= id;
  for (const id of c.skills ?? []) {
    const s = skills[id];
    if (!s) continue;
    entry.skills[id] = {
      type: s.type,
      effect: s.effect,
      point: pointOf[id],
      maxLevel: s.max_level,
      params: (s.params ?? []).map((row) => row.map(round)),
    };
  }
  for (const id of c.skill_trees ?? []) {
    const t = trees[id];
    if (!t?.params?.length || !t.params[0]?.length) continue;
    entry.traces[id] = t.params[0].map(round);
  }
  sk.characters[c.id] = entry;
}
for (const r of Object.values(lcRanks)) {
  if (r.params?.length) sk.lightCones[r.id] = r.params.map((row) => row.map(round));
}

// Toughness reduction and energy per skill come from sr.yatta.moe (not in StarRailRes).
// Their numbers are 3× the in-game display (Basic ATK 30 → 10). Previous values are kept
// when a request fails, so a bad day never wipes them.
let previous = {};
try {
  previous = JSON.parse(await (await import("node:fs/promises")).readFile(SKILLS_OUT, "utf8")).characters ?? {};
} catch {
  // first run
}
const ids = Object.keys(sk.characters);
let fetched = 0;
for (let i = 0; i < ids.length; i += 4) {
  await Promise.all(
    ids.slice(i, i + 4).map(async (id) => {
      const entry = sk.characters[id];
      try {
        const res = await fetch(`https://sr.yatta.moe/api/v2/kr/avatar/${id}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()).data;
        for (const group of Object.values(data?.traces ?? {})) {
          for (const node of Object.values(group ?? {})) {
            for (const [sid, y] of Object.entries(node?.skillList ?? {})) {
              const target = entry.skills[sid];
              if (!target) continue;
              const wb = y.weaknessBreak;
              if (wb) target.tough = Object.fromEntries(Object.entries(wb).map(([k, v]) => [k, +(v / 3).toFixed(3)]));
              if (y.skillPoints?.base != null) target.energy = y.skillPoints.base;
              if (y.skillPoints?.need != null) target.need = y.skillPoints.need;
            }
          }
        }
        fetched++;
      } catch {
        for (const [sid, old] of Object.entries(previous[id]?.skills ?? {})) {
          const target = entry.skills[sid];
          if (!target) continue;
          if (old.tough) target.tough = old.tough;
          if (old.energy != null) target.energy = old.energy;
          if (old.need != null) target.need = old.need;
        }
      }
    }),
  );
}
// Enhanced (reworked) skills are "1" + the original id; they keep the original's toughness and energy
for (const entry of Object.values(sk.characters)) {
  for (const [sid, target] of Object.entries(entry.skills)) {
    if (sid.length < 7 || !sid.startsWith("1") || target.tough || target.energy != null) continue;
    for (const other of Object.values(sk.characters)) {
      const base = other.skills[sid.slice(1)];
      if (!base) continue;
      if (base.tough) target.tough = base.tough;
      if (base.energy != null) target.energy = base.energy;
      if (base.need != null) target.need = base.need;
      break;
    }
  }
}
console.log(`skills.json: toughness/energy from yatta for ${fetched}/${ids.length} characters`);

await mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(out));
await writeFile(SKILLS_OUT, JSON.stringify(sk));
console.log(
  `game.json: ${Object.keys(out.characters).length} characters, ${Object.keys(out.lightCones).length} light cones, ${Object.keys(out.relicSets).length} relic sets`,
);
