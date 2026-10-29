// Pulls Korean game data from StarRailRes and writes a trimmed copy to src/data/game.json.
// Run with: pnpm sync:gamedata
import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/index_new/kr";
const OUT = new URL("../src/data/game.json", import.meta.url);

async function load(name) {
  const res = await fetch(`${BASE}/${name}.json`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}

const [characters, lightCones, relicSets, relics, paths, elements, properties, charPromo, lcPromo] =
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

await mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(out));
console.log(
  `game.json: ${Object.keys(out.characters).length} characters, ${Object.keys(out.lightCones).length} light cones, ${Object.keys(out.relicSets).length} relic sets`,
);
