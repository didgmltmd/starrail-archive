// Extracts per-character recommended builds from hsr-optimizer (MIT, github.com/fribbels/hsr-optimizer)
// and writes src/data/builds.json. Run with: pnpm sync:builds
//
// For each character it reads the `scoring` block (sub stat weights + recommended main stats)
// and the `simulation` block (recommended relic / ornament sets).
import { writeFile } from "node:fs/promises";

const REPO = "fribbels/hsr-optimizer";
const RAW = `https://raw.githubusercontent.com/${REPO}/main/`;
const OUT = new URL("../src/data/builds.json", import.meta.url);

const STAT = {
  ATK_P: "ATK_P", ATK: "ATK", DEF_P: "DEF_P", DEF: "DEF", HP_P: "HP_P", HP: "HP", SPD: "SPD",
  CR: "CR", CD: "CD", BE: "BE", OHB: "OHB", ERR: "ERR", EHR: "EHR", RES: "RES",
  Physical_DMG: "Physical_DMG", Fire_DMG: "Fire_DMG", Ice_DMG: "Ice_DMG", Lightning_DMG: "Thunder_DMG",
  Wind_DMG: "Wind_DMG", Quantum_DMG: "Quantum_DMG", Imaginary_DMG: "Imaginary_DMG",
};
const PART = { Body: "BODY", Feet: "FOOT", PlanarSphere: "NECK", LinkRope: "OBJECT" };

async function text(url) {
  // In GitHub Actions the token lifts the API rate limit for the tree listing.
  const headers =
    process.env.GITHUB_TOKEN && url.startsWith("https://api.github.com/")
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** Returns the text between the bracket that opens at `start` and its matching close. */
function block(src, start) {
  const open = src[start];
  const close = open === "{" ? "}" : open === "[" ? "]" : ")";
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) return src.slice(start + 1, i);
  }
  return "";
}

function section(src, label) {
  const m = new RegExp(`\\b${label}\\s*:\\s*([\\[{])`).exec(src);
  return m ? block(src, m.index + m[0].length - 1) : "";
}

function fnBody(src, name) {
  const m = new RegExp(`const ${name} = \\(\\)[^=]*=>\\s*\\(\\{`).exec(src);
  return m ? block(src, m.index + m[0].length - 1) : "";
}

// Map "Sets.PioneerDiverOfDeadWaters" keys to StarRailRes set ids via the order of the Sets constant
// (relics 101.., ornaments 301..), cross-checked against English set names.
async function setIdMap() {
  const constants = await text(RAW + "src/lib/constants/constants.ts");
  const body = block(constants, constants.indexOf("{", constants.indexOf("export const Sets = ")));
  const en = JSON.parse(await text("https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/index_new/en/relic_sets.json"));
  const byName = Object.fromEntries(Object.values(en).map((s) => [norm(s.name), s.id]));
  const map = {};
  let relic = 101;
  let orn = 301;
  let inOrnaments = false;
  for (const line of body.split("\n")) {
    if (/\/\/\s*Ornaments/.test(line)) inOrnaments = true;
    const m = /^\s*(\w+):\s*['"](.+?)['"],?\s*$/.exec(line.replace(/\\'/g, "'"));
    if (!m) continue;
    const byOrder = String(inOrnaments ? orn++ : relic++);
    map[m[1]] = byName[norm(m[2])] ?? byOrder;
  }
  return map;
}

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const tree = JSON.parse(await text(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`));
const files = tree.tree
  .map((t) => t.path)
  .filter((p) => /^src\/lib\/conditionals\/character\/\d+\/\w+\.ts$/.test(p));
const setIds = await setIdMap();

const out = {};
const skipped = [];

async function handle(path) {
  const src = await text(RAW + path);
  const cfg = /export const \w+: CharacterConfig = \{([\s\S]*)$/.exec(src);
  const id = cfg && /\bid:\s*['"](\d+)['"]/.exec(cfg[1])?.[1];
  const scoring = fnBody(src, "scoring");
  if (!id || !scoring) return skipped.push(path.split("/").pop());

  const weights = {};
  for (const m of section(scoring, "stats").matchAll(/\[Stats\.(\w+)\]:\s*([\d.]+)/g)) {
    if (STAT[m[1]] && +m[2] > 0) weights[STAT[m[1]]] = +m[2];
  }

  const mains = {};
  for (const m of section(scoring, "parts").matchAll(/\[Parts\.(\w+)\]:\s*\[([^\]]*)\]/g)) {
    if (!PART[m[1]]) continue;
    mains[PART[m[1]]] = [...m[2].matchAll(/Stats\.(\w+)/g)].map((x) => STAT[x[1]]).filter(Boolean);
  }

  const sim = fnBody(src, "simulation");
  const relicSets = [];
  for (const m of section(sim, "relicSets").matchAll(/\[\s*Sets\.(\w+)\s*,\s*Sets\.(\w+)\s*,?\s*\]/g)) {
    const pair = [setIds[m[1]], setIds[m[2]]];
    if (pair[0] && pair[1]) relicSets.push(pair);
  }
  const ornamentSets = [...section(sim, "ornamentSets").matchAll(/(?<!\.\.\.)\bSets\.(\w+)/g)]
    .map((m) => setIds[m[1]])
    .filter(Boolean);

  if (!Object.keys(weights).length) return skipped.push(path.split("/").pop());
  out[id] = { weights, mains, relicSets, ornamentSets: [...new Set(ornamentSets)] };
}

// Small concurrency pool so GitHub is not hammered
const queue = [...files];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (queue.length) await handle(queue.shift()).catch((e) => skipped.push(`${e.message}`));
  }),
);

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(OUT, JSON.stringify({ source: `https://github.com/${REPO}`, builds: sorted }, null, 1));
console.log(`builds.json: ${Object.keys(sorted).length} characters (from ${files.length} files)`);
if (skipped.length) console.log(`skipped: ${skipped.join(", ")}`);
