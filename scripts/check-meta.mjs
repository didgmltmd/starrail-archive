// Validates src/data/meta.json: shape, ids that exist in game.json, and a source on every item.
// Usage: node scripts/check-meta.mjs   (exit code 1 on problems)
import { readFileSync } from "node:fs";

const meta = JSON.parse(readFileSync(new URL("../src/data/meta.json", import.meta.url), "utf8"));
const game = JSON.parse(readFileSync(new URL("../src/data/game.json", import.meta.url), "utf8"));

const STATS = new Set(
  "HP ATK DEF SPD HP_P ATK_P DEF_P CR CD BE OHB ERR EHR RES Physical_DMG Fire_DMG Ice_DMG Thunder_DMG Wind_DMG Quantum_DMG Imaginary_DMG".split(" "),
);
const ELEMENTS = new Set(["Physical", "Fire", "Ice", "Thunder", "Wind", "Quantum", "Imaginary"]);
const MODES = new Set(["moc", "pf", "as"]);
const problems = [];
const images = [];
const bad = (where, msg) => problems.push(`${where}: ${msg}`);

const char = (where, id) => game.characters[id] || bad(where, `unknown character id ${id}`);
const set = (where, id) => game.relicSets[id] || bad(where, `unknown relic set id ${id}`);
function sources(where, s) {
  if (!Array.isArray(s) || s.length === 0) return bad(where, "missing sources");
  for (const x of s) {
    if (!/^https?:\/\//.test(x?.url ?? "")) bad(where, `bad source url ${x?.url}`);
    if (!x?.title) bad(where, "source without title");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x?.checked ?? "")) bad(where, `source without checked date (${x?.url})`);
  }
}

if (meta.version !== 1) bad("root", "version must be 1");
if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.updatedAt ?? "")) bad("root", "updatedAt must be YYYY-MM-DD");

for (const [mode, r] of Object.entries(meta.rotations ?? {})) {
  const w = `rotations.${mode}`;
  if (!MODES.has(mode)) bad(w, "unknown mode");
  if (!r.name) bad(w, "missing name");
  for (const side of r.sides ?? []) for (const e of side.weaknesses ?? []) if (!ELEMENTS.has(e)) bad(w, `bad element ${e}`);
  for (const b of r.bosses ?? []) {
    if (!b.name) bad(w, "boss without name");
    if (!/^https:\/\//.test(b.image ?? "")) bad(w, `boss ${b.name} needs an https image`);
    if (b.side && !(r.sides ?? []).some((s) => s.label === b.side)) bad(w, `boss ${b.name} side "${b.side}" not in sides`);
    images.push([w, b]);
  }
  sources(w, r.sources);
}

for (const [i, t] of (meta.teams ?? []).entries()) {
  const w = `teams[${i}] ${t.name ?? ""}`;
  if (!t.id) bad(w, "missing id");
  (t.members ?? []).forEach((id) => char(w, id));
  if ((t.members ?? []).length === 0 || t.members.length > 4) bad(w, "members must be 1-4 ids");
  for (const [k, alts] of Object.entries(t.alternatives ?? {})) [k, ...alts].forEach((id) => char(w, id));
  (t.modes ?? []).forEach((m) => MODES.has(m) || bad(w, `bad mode ${m}`));
  sources(w, t.sources);
}

for (const [id, b] of Object.entries(meta.benchmarks ?? {})) {
  const w = `benchmarks.${id}`;
  char(w, id);
  for (const k of Object.keys(b.stats ?? {})) if (!STATS.has(k)) bad(w, `bad stat ${k}`);
  for (const [k, v] of Object.entries(b.stats ?? {})) {
    if (typeof v !== "number") bad(w, `${k} must be a number`);
    else if (k !== "SPD" && !["HP", "ATK", "DEF"].includes(k) && v > 5) bad(w, `${k}=${v} looks like a percent, use a ratio`);
  }
  sources(w, b.sources);
}

for (const [i, tb] of (meta.teamBuilds ?? []).entries()) {
  const w = `teamBuilds[${i}]`;
  char(w, tb.charId);
  for (const pair of tb.relicSets ?? []) pair.forEach((id) => set(w, id));
  for (const id of tb.ornamentSets ?? []) set(w, id);
  for (const list of Object.values(tb.mains ?? {})) for (const k of list) if (!STATS.has(k)) bad(w, `bad stat ${k}`);
  sources(w, tb.sources);
}

for (const [i, p] of (meta.buildPriority ?? []).entries()) {
  const w = `buildPriority[${i}]`;
  char(w, p.charId);
  sources(w, p.sources);
}

// speedkits.json: speed effects used by the team speed simulator
const kits = JSON.parse(readFileSync(new URL("../src/data/speedkits.json", import.meta.url), "utf8"));
const ON = new Set(["start", "passive", "skill", "basic", "ult"]);
const KINDS = new Set(["advance", "nextAdvance", "spdPct", "spdFlat", "spdOfCaster", "countdown", "advanceByElation"]);
const PATHS = new Set(Object.keys(game.paths));
function effect(w, e) {
  if (!ON.has(e.on)) bad(w, `bad on ${e.on}`);
  if (!KINDS.has(e.kind)) bad(w, `bad kind ${e.kind}`);
  const to = String(e.to ?? "");
  if (!["self", "ally", "team", "others"].includes(to) && !(to.startsWith("path:") && PATHS.has(to.slice(5)))) bad(w, `bad to ${to}`);
  const vals = Array.isArray(e.value) ? e.value : [e.value];
  if (!vals.length || vals.some((v) => typeof v !== "number" || !(v > 0))) bad(w, "value must be positive number(s)");
  if (["advance", "nextAdvance", "spdPct", "spdOfCaster"].includes(e.kind) && vals.some((v) => v > 1)) bad(w, "ratio over 1");
  if (e.notPath && !PATHS.has(e.notPath)) bad(w, `bad notPath ${e.notPath}`);
  if (e.path && !PATHS.has(e.path)) bad(w, `bad path ${e.path}`);
  if (!e.note) bad(w, "missing note");
}
if (kits.version !== 1) bad("speedkits", "version must be 1");
for (const [id, list] of Object.entries(kits.characters ?? {})) list.forEach((e, i) => (char(`speedkits.characters.${id}`, id), effect(`speedkits.characters.${id}[${i}]`, e)));
for (const [id, list] of Object.entries(kits.lightCones ?? {})) {
  if (!game.lightCones[id]) bad(`speedkits.lightCones.${id}`, "unknown light cone id");
  list.forEach((e, i) => effect(`speedkits.lightCones.${id}[${i}]`, e));
}
for (const [id, list] of Object.entries(kits.relicSets ?? {})) list.forEach((e, i) => (set(`speedkits.relicSets.${id}`, id), effect(`speedkits.relicSets.${id}[${i}]`, e)));

// --check-images: make sure every boss image actually loads (used by the weekly research)
if (process.argv.includes("--check-images")) {
  for (const [w, b] of images) {
    try {
      const res = await fetch(b.image, { method: "GET", redirect: "follow" });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/")) bad(w, `boss image ${b.name}: HTTP ${res.status} ${type}`);
    } catch (e) {
      bad(w, `boss image ${b.name}: ${e.message}`);
    }
  }
}

if (problems.length) {
  console.error(`meta.json: ${problems.length} problem(s)\n` + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
console.log(
  `meta.json OK: ${Object.keys(meta.rotations ?? {}).length} rotations, ${(meta.teams ?? []).length} teams, ` +
    `${Object.keys(meta.benchmarks ?? {}).length} benchmarks, ${(meta.teamBuilds ?? []).length} team builds`,
);
