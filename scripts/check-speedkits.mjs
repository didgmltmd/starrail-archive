// Validates src/data/speedkits.json (speed effects for the party simulator): shape and ids that exist in game.json.
// Usage: node scripts/check-speedkits.mjs   (exit code 1 on problems)
import { readFileSync } from "node:fs";

const game = JSON.parse(readFileSync(new URL("../src/data/game.json", import.meta.url), "utf8"));
const kits = JSON.parse(readFileSync(new URL("../src/data/speedkits.json", import.meta.url), "utf8"));

const problems = [];
const bad = (where, msg) => problems.push(`${where}: ${msg}`);
const char = (where, id) => game.characters[id] || bad(where, `unknown character id ${id}`);
const set = (where, id) => game.relicSets[id] || bad(where, `unknown relic set id ${id}`);

const ON = new Set(["start", "passive", "skill", "basic", "ult"]);
const KINDS = new Set(["advance", "nextAdvance", "spdPct", "spdFlat", "spdOfCaster", "countdown", "advanceByElation", "ahaExtraTurn", "ahaSpdPerAllyAttack"]);
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
for (const [id, list] of Object.entries(kits.characters ?? {})) list.forEach((e, i) => (char(`characters.${id}`, id), effect(`characters.${id}[${i}]`, e)));
for (const [id, list] of Object.entries(kits.lightCones ?? {})) {
  if (!game.lightCones[id]) bad(`lightCones.${id}`, "unknown light cone id");
  list.forEach((e, i) => effect(`lightCones.${id}[${i}]`, e));
}
for (const [id, list] of Object.entries(kits.relicSets ?? {})) list.forEach((e, i) => (set(`relicSets.${id}`, id), effect(`relicSets.${id}[${i}]`, e)));

if (problems.length) {
  console.error(`speedkits.json: ${problems.length} problem(s)\n` + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
console.log(
  `speedkits.json OK: ${Object.keys(kits.characters ?? {}).length} characters, ` +
    `${Object.keys(kits.lightCones ?? {}).length} light cones, ${Object.keys(kits.relicSets ?? {}).length} relic sets`,
);
