// Validates src/data/dmgkits.json (or a fragment passed as an argument) against the game data.
// Usage: node scripts/check-kits.mjs [file.json]
// Fragments may hold only some of "characters", "lightCones", "relicSets".
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? new URL("../src/data/dmgkits.json", import.meta.url);
const kits = JSON.parse(readFileSync(file, "utf8"));
const game = JSON.parse(readFileSync(new URL("../src/data/game.json", import.meta.url), "utf8"));
const skills = JSON.parse(readFileSync(new URL("../src/data/skills.json", import.meta.url), "utf8"));

const problems = [];
const bad = (where, msg) => problems.push(`${where}: ${msg}`);

const DMG_TYPES = new Set(["basic", "skill", "ult", "followup", "dot", "additional", "elation", "memosprite", "summon", "break", "superBreak"]);
const STATS = new Set([
  "HP", "HP%", "ATK", "ATK%", "DEF", "DEF%", "SPD", "SPD%", "CR", "CD", "BE", "ERR", "EHR", "OHB", "ELA", "Merrymake",
  "DMG%", "DEFIgnore", "RESPen", "multAdd", "finalMult", "breakDMG%", "superBreakDMG%", "superBreak", "breakEff",
  "DEFDown", "RESDown", "Vuln",
]);
const DO = new Set([
  "advance", "nextAdvance", "countdown", "energy", "energyPct", "sp", "punchline", "banger", "bangerExtend", "extraTurn",
  "ahaExtraTurn", "ahaSpd", "action", "counter", "setCounter", "state", "endState", "stateUses", "dmg", "dot", "detonate",
  "toughness", "summon", "unstack", "maxSp",
]);
const TRIGGERS = new Set([
  "passive", "start", "turnStart", "turnEnd", "attack", "basic", "skill", "ult", "followup", "elation", "memosprite", "summon",
  "allyAttack", "allySkill", "allyUlt", "allyBasic", "allyAction", "anyAttack", "anyUlt", "enemyTurn", "break", "selfBreak",
  "aha", "punchline", "spSpent", "end",
]);
const ELEMENTS = new Set(Object.keys(game.elements));
const PATHS = new Set(Object.keys(game.paths));
const AREAS = new Set(["single", "blast", "aoe", "bounce", "split"]);

function checkValue(w, v, ctx) {
  if (v === undefined) return;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) bad(w, "number is not finite");
    return;
  }
  if (!v || typeof v !== "object") return bad(w, `bad value ${JSON.stringify(v)}`);
  if ("skill" in v) {
    const s = ctx.char && skills.characters[ctx.char]?.skills[v.skill];
    if (!s) return bad(w, `skill ${v.skill} is not a skill of ${ctx.char ?? "(no character)"}`);
    if (!(v.p >= 0 && v.p < (s.params[0]?.length ?? 0))) bad(w, `skill ${v.skill} has no param p${v.p} (has ${s.params[0]?.length ?? 0})`);
    return;
  }
  if ("tree" in v) {
    const t = ctx.char && skills.characters[ctx.char]?.traces[v.tree];
    if (!t) return bad(w, `trace ${v.tree} has no params for ${ctx.char ?? "(no character)"}`);
    if (!(v.p >= 0 && v.p < t.length)) bad(w, `trace ${v.tree} has no param p${v.p}`);
    return;
  }
  if ("lc" in v) {
    const rows = ctx.lc && skills.lightCones[ctx.lc];
    if (!rows) return bad(w, `{lc} used outside a light cone with params`);
    if (!(v.lc >= 0 && v.lc < rows[0].length)) bad(w, `light cone ${ctx.lc} has no param ${v.lc}`);
    return;
  }
  if ("stat" in v) {
    if (!STATS.has(v.stat) && !/_DMG$/.test(v.stat)) bad(w, `unknown stat ${v.stat}`);
    return;
  }
  for (const op of ["add", "mul", "min", "max", "sub", "div"]) {
    if (op in v) {
      if (!Array.isArray(v[op])) return bad(w, `${op} needs an array`);
      v[op].forEach((x, i) => checkValue(`${w}.${op}[${i}]`, x, ctx));
      return;
    }
  }
  if ("steps" in v) {
    checkValue(`${w}.steps.over`, v.steps.over, ctx);
    checkValue(`${w}.steps.per`, v.steps.per, ctx);
    checkValue(`${w}.steps.max`, v.steps.max, ctx);
    return;
  }
  if ("pick" in v) {
    v.pick.forEach((x, i) => checkValue(`${w}.pick[${i}]`, x, ctx));
    checkValue(`${w}.by`, v.by, ctx);
    return;
  }
  if ("floor" in v) return checkValue(`${w}.floor`, v.floor, ctx);
  if ("gte" in v) return v.gte.forEach((x, i) => checkValue(`${w}.gte[${i}]`, x, ctx));
  if ("count" in v || "counter" in v || "ev" in v || "rank" in v || "maxEnergy" in v || "trace" in v || "punch" in v || "sp" in v || "banger" in v) return;
  bad(w, `unknown value ${JSON.stringify(v)}`);
}

function checkCond(w, c, ctx) {
  if (!c) return;
  const known = ["broken", "stat", "count", "counter", "state", "notState", "debuffs", "path", "notPath", "banger", "all", "any", "weak", "maxEnergy", "ahaExtra", "holder", "ev", "source", "chosen"];
  for (const k of Object.keys(c)) if (!known.includes(k)) bad(w, `unknown condition ${k}`);
  if (c.stat) {
    checkValue(`${w}.stat.gte`, c.stat.gte, ctx);
    checkValue(`${w}.stat.lte`, c.stat.lte, ctx);
  }
  if (c.path && !PATHS.has(c.path)) bad(w, `bad path ${c.path}`);
  if (c.notPath && !PATHS.has(c.notPath)) bad(w, `bad path ${c.notPath}`);
  if (c.weak && !ELEMENTS.has(c.weak)) bad(w, `bad element ${c.weak}`);
  if (c.state && ctx.states && !ctx.states.has(c.state)) bad(w, `unknown state ${c.state}`);
  if (c.notState && ctx.states && !ctx.states.has(c.notState)) bad(w, `unknown state ${c.notState}`);
  for (const k of ["all", "any"]) (c[k] ?? []).forEach((x, i) => checkCond(`${w}.${k}[${i}]`, x, ctx));
  if (c.holder) checkCond(`${w}.holder`, c.holder, ctx);
  if (c.source) checkCond(`${w}.source`, c.source, ctx);
}

function checkTarget(w, to) {
  if (to === undefined) return;
  if (["self", "ally", "team", "others", "source", "enemy", "enemies"].includes(to)) return;
  if (to.startsWith("path:") && PATHS.has(to.slice(5))) return;
  if (to.startsWith("element:") && ELEMENTS.has(to.slice(8))) return;
  if (to.startsWith("summon:")) return;
  bad(w, `bad target ${to}`);
}

function checkHit(w, h, ctx) {
  checkValue(`${w}.mult`, h.mult, ctx);
  checkValue(`${w}.adjMult`, h.adjMult, ctx);
  checkValue(`${w}.bounces`, h.bounces, ctx);
  checkValue(`${w}.flat`, h.flat, ctx);
  checkValue(`${w}.punchMul`, h.punchMul, ctx);
  checkValue(`${w}.breakRatio`, h.breakRatio, ctx);
  if (h.area && !AREAS.has(h.area)) bad(w, `bad area ${h.area}`);
  if (h.area === "bounce" && h.bounces === undefined) bad(w, "bounce needs bounces");
  if (h.toughness !== undefined && h.toughness !== "auto" && typeof h.toughness !== "number") bad(w, "toughness must be a number or \"auto\"");
  if (h.toughness === "auto" && !ctx.actionSkill) bad(w, "toughness \"auto\" needs the action's skill id");
  if (h.element && !ELEMENTS.has(h.element)) bad(w, `bad element ${h.element}`);
  if (h.scale && !["ATK", "HP", "DEF"].includes(h.scale)) bad(w, `bad scale ${h.scale}`);
  for (const t of h.types ?? []) if (!DMG_TYPES.has(t)) bad(w, `bad damage type ${t}`);
  checkCond(`${w}.cond`, h.cond, ctx);
}

function checkEffect(w, e, ctx) {
  if (!e || typeof e !== "object") return bad(w, "effect must be an object");
  if (!e.note) bad(w, "missing note");
  const on = String(e.on ?? "");
  if (!TRIGGERS.has(on) && !/^(action|counter|summon|before):/.test(on)) bad(w, `unknown trigger ${on}`);
  if (on.startsWith("action:") && ctx.actions && !ctx.actions.has(on.slice(7))) bad(w, `trigger on unknown action ${on.slice(7)}`);
  if (!!e.stat === !!e.do) bad(w, "needs exactly one of stat / do");
  if (e.stat && !STATS.has(e.stat)) bad(w, `unknown stat ${e.stat}`);
  if (e.do && !DO.has(e.do)) bad(w, `unknown do ${e.do}`);
  if (e.stat && on !== "passive" && e.dur === undefined && !ctx.inState && !e.stack && !e.limit?.total) {
    bad(w, "triggered stat buff without dur lasts the whole battle; add dur or make it passive");
  }
  checkTarget(w, e.to);
  checkValue(`${w}.value`, e.value, ctx);
  checkValue(`${w}.dur`, e.dur, ctx);
  checkValue(`${w}.chance`, e.chance, ctx);
  checkCond(`${w}.cond`, e.cond, ctx);
  for (const t of e.types ?? []) if (!DMG_TYPES.has(t)) bad(w, `bad damage type ${t}`);
  if (e.element && !ELEMENTS.has(e.element)) bad(w, `bad element ${e.element}`);
  if (e.trace && ctx.char && !(skills.characters[ctx.char]?.traces[e.trace] || /^\d+$/.test(e.trace))) bad(w, `bad trace ${e.trace}`);
  if (e.do === "action" && ctx.actions && !ctx.actions.has(e.ref ?? "followup")) bad(w, `action ${e.ref} is not defined`);
  if ((e.do === "state" || e.do === "endState" || e.do === "stateUses") && ctx.states && !ctx.states.has(e.ref)) bad(w, `state ${e.ref} is not defined`);
  if ((e.do === "counter" || e.do === "setCounter") && ctx.counters && !ctx.counters.has(e.ref)) bad(w, `counter ${e.ref} is not declared in counters`);
  if (e.do === "dmg") (e.hits ?? []).forEach((h, i) => checkHit(`${w}.hits[${i}]`, h, ctx));
  if (e.do === "dot") {
    if (!e.dot) bad(w, "dot needs dot: {mult, dur}");
    else checkValue(`${w}.dot.mult`, e.dot.mult, ctx);
  }
  if (e.pieces !== undefined && ![2, 4].includes(e.pieces)) bad(w, "pieces must be 2 or 4");
}

for (const [key, kit] of Object.entries(kits.characters ?? {})) {
  const id = key.replace(/:e$/, "");
  const w = `characters.${key}`;
  if (!game.characters[id]) {
    bad(w, "unknown character id");
    continue;
  }
  if (key.endsWith(":e") && !Object.entries(skills.characters[id]?.skills ?? {}).some(([s, d]) => s.startsWith(`1${id}`) && ["Normal", "BPSkill", "Ultra", "Talent"].includes(d.type))) {
    bad(w, "this character has no enhanced skills in the game data");
  }
  const actions = new Set(Object.keys(kit.actions ?? {}));
  const states = new Set((kit.states ?? []).map((s) => s.id));
  const counters = new Set(Object.keys(kit.counters ?? {}));
  if (kit.ultCost) counters.add(kit.ultCost.counter);
  const ctx = { char: id, actions, states, counters };
  for (const need of ["basic", "skill", "ult"]) if (!actions.has(need)) bad(w, `missing action ${need}`);
  for (const [name, a] of Object.entries(kit.actions ?? {})) {
    const aw = `${w}.actions.${name}`;
    if (!DMG_TYPES.has(a.type)) bad(aw, `bad type ${a.type}`);
    if (a.skill && !skills.characters[id]?.skills[a.skill]) bad(aw, `skill ${a.skill} is not a skill of ${id}`);
    const actx = { ...ctx, actionSkill: a.skill };
    (a.hits ?? []).forEach((h, i) => checkHit(`${aw}.hits[${i}]`, h, actx));
    (a.before ?? []).forEach((e, i) => checkEffect(`${aw}.before[${i}]`, e, { ...actx, inState: true }));
    checkValue(`${aw}.punchline`, a.punchline, ctx);
  }
  (kit.states ?? []).forEach((s, i) => {
    const sw = `${w}.states[${i}]`;
    if (!s.id) bad(sw, "missing id");
    for (const [from, to] of Object.entries(s.replace ?? {})) if (!actions.has(to)) bad(sw, `replace ${from} → unknown action ${to}`);
    checkValue(`${sw}.dur`, s.dur, ctx);
    (s.effects ?? []).forEach((e, j) => checkEffect(`${sw}.effects[${j}]`, e, { ...ctx, inState: true }));
    (s.onEnd ?? []).forEach((e, j) => checkEffect(`${sw}.onEnd[${j}]`, e, { ...ctx, inState: true }));
  });
  for (const [cid, c] of Object.entries(kit.counters ?? {})) {
    checkValue(`${w}.counters.${cid}.max`, c.max, ctx);
    checkValue(`${w}.counters.${cid}.at`, c.at, ctx);
    (c.then ?? []).forEach((e, j) => checkEffect(`${w}.counters.${cid}.then[${j}]`, e, { ...ctx, inState: true }));
  }
  (kit.summons ?? []).forEach((s, i) => {
    if (!actions.has(s.action)) bad(`${w}.summons[${i}]`, `unknown action ${s.action}`);
    checkValue(`${w}.summons[${i}].spd`, s.spd, ctx);
  });
  (kit.effects ?? []).forEach((e, i) => checkEffect(`${w}.effects[${i}]`, e, ctx));
}

for (const [id, kit] of Object.entries(kits.lightCones ?? {})) {
  const w = `lightCones.${id}`;
  if (!game.lightCones[id]) bad(w, "unknown light cone id");
  (kit.effects ?? []).forEach((e, i) => checkEffect(`${w}.effects[${i}]`, e, { lc: id }));
}
for (const [id, kit] of Object.entries(kits.relicSets ?? {})) {
  const w = `relicSets.${id}`;
  if (!game.relicSets[id]) bad(w, "unknown relic set id");
  (kit.effects ?? []).forEach((e, i) => {
    if (e.pieces === undefined) bad(`${w}.effects[${i}]`, "relic set effects need pieces (2 or 4)");
    checkEffect(`${w}.effects[${i}]`, e, {});
  });
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log(
  `kits OK: ${Object.keys(kits.characters ?? {}).length} characters, ${Object.keys(kits.lightCones ?? {}).length} light cones, ${Object.keys(kits.relicSets ?? {}).length} relic sets`,
);
