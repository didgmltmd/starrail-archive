// Prints Korean game text with every number tagged by its param index, for writing damage kits.
// Usage:
//   node scripts/kit-text.mjs char <id...>      skills (Lv.10 / basic Lv.6), traces, eidolons, energy, toughness
//   node scripts/kit-text.mjs lc <id...>        light cone passive at S1 with param indices (S1–S5 values listed)
//   node scripts/kit-text.mjs set <id...>       relic set 2/4-piece text
// «66%=p0» means the number comes from params[...][0]: write { "skill": "<id>", "p": 0 } in the kit.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/index_new/kr";
const CACHE = join(tmpdir(), "sra-kit-text");
mkdirSync(CACHE, { recursive: true });

async function load(name) {
  const p = join(CACHE, `${name}.json`);
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  const res = await fetch(`${BASE}/${name}.json`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(p, text);
  return JSON.parse(text);
}

const fill = (d, p) =>
  String(d ?? "").replace(/#(\d+)\[(i|f\d)\](%?)/g, (m, i, _f, pct) => {
    const v = p?.[i - 1];
    if (v === undefined) return m;
    const x = pct ? v * 100 : v;
    return `«${+x.toFixed(3)}${pct}=p${i - 1}»`;
  });
const flat = (s) => String(s).replace(/\n/g, " ");

const [mode, ...ids] = process.argv.slice(2);
const skillsOut = JSON.parse(readFileSync(new URL("../src/data/skills.json", import.meta.url), "utf8"));

if (mode === "char") {
  const [chars, skills, trees, ranks] = await Promise.all(["characters", "character_skills", "character_skill_trees", "character_ranks"].map(load));
  for (const id of ids) {
    const c = chars[id];
    if (!c) {
      console.log(`unknown character ${id}`);
      continue;
    }
    console.log(`\n##### ${id} ${c.name} | path ${c.path} | element ${c.element} | max energy ${c.max_sp}`);
    const data = skillsOut.characters[id]?.skills ?? {};
    for (const s of c.skills) {
      const x = skills[s];
      if (!x || x.type === "MazeNormal") continue;
      const lv = Math.min(x.max_level, x.type === "Normal" ? 6 : 10);
      const d = data[s] ?? {};
      const extra = [d.energy != null ? `energy ${d.energy}` : "", d.tough ? `toughness ${JSON.stringify(d.tough)}` : "", d.need != null ? `ult cost ${d.need}` : ""]
        .filter(Boolean)
        .join(", ");
      console.log(`[skill ${s} | ${x.type} ${x.type_text ?? ""} | "${x.name}" | ${x.effect_text ?? x.effect} | shown at Lv.${lv}${extra ? ` | ${extra}` : ""}]\n  ${flat(fill(x.desc, x.params[lv - 1]))}`);
    }
    for (const t of c.skill_trees) {
      const x = trees[t];
      if (!x || !x.params?.[0]?.length) continue;
      console.log(`[trace ${t} "${x.name}"]\n  ${flat(fill(x.desc, x.params[0]))}`);
    }
    for (const r of c.ranks) {
      const x = ranks[r];
      console.log(`[E${x.rank} "${x.name}"]\n  ${flat(x.desc)}`);
    }
    // Enhanced versions have their own eidolons (1<id>01 … 1<id>06)
    const eRanks = [1, 2, 3, 4, 5, 6].map((n) => ranks[`1${id}0${n}`]).filter(Boolean);
    for (const x of eRanks) console.log(`[enhanced E${x.rank} "${x.name}"]
  ${flat(x.desc)}`);
    const enhanced = c.skills.some((s) => s.startsWith(`1${id}`) && ["Normal", "BPSkill", "Ultra", "Talent"].includes(skills[s]?.type));
    if (enhanced) console.log(`NOTE: skills/traces starting with "1${id}" are the enhanced (reworked) version → write it as "${id}:e".`);
  }
} else if (mode === "lc") {
  const [lcs, ranks] = await Promise.all(["light_cones", "light_cone_ranks"].map(load));
  for (const id of ids) {
    const l = lcs[id];
    const r = ranks[id];
    if (!l || !r) {
      console.log(`unknown light cone ${id}`);
      continue;
    }
    console.log(`\n##### ${id} ${l.name} | ${l.rarity}★ ${l.path} | passive "${r.skill}"`);
    console.log(`  ${flat(fill(r.desc, r.params[0]))}`);
    r.params[0].forEach((_, i) => console.log(`  p${i}: S1–S5 = ${r.params.map((row) => row[i]).join(" / ")}`));
    if (r.properties?.[0]?.length) console.log(`  always-on stats (already in HoYoLAB totals, do not add): ${JSON.stringify(r.properties[0])}`);
  }
} else if (mode === "set") {
  const sets = await load("relic_sets");
  for (const id of ids) {
    const s = sets[id];
    if (!s) {
      console.log(`unknown relic set ${id}`);
      continue;
    }
    console.log(`\n##### ${id} ${s.name}`);
    s.desc.forEach((d, i) => console.log(`  ${i === 0 ? 2 : 4}pc: ${flat(d)}  ${s.properties?.[i]?.length ? `(always-on stats already in HoYoLAB totals: ${JSON.stringify(s.properties[i])})` : ""}`));
  }
} else {
  console.log("usage: node scripts/kit-text.mjs char|lc|set <id...>");
}
