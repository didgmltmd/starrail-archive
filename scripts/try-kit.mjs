// Runs the battle simulator for one character with a generic build, to try a damage kit.
// Usage: node scripts/try-kit.mjs <charId> [--kits fragment.json] [--e 0-6] [--lc id:s] [--sets 102:4,305:2]
//        [--team id,id,id] [--enemies 3] [--cycles 3] [--enhanced] [--log]
// Prints damage per action and warns about NaN, missing damage and engine errors.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const id = args[0];
if (!id) {
  console.error("usage: node scripts/try-kit.mjs <charId> [--kits fragment.json] [--e N] [--lc id:s] [--sets id:n,...] [--team a,b,c]");
  process.exit(1);
}

const { createServer } = await import(new URL("../node_modules/vite/dist/node/index.js", import.meta.url).href);
const server = await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false } });
try {
  const kitsMod = await server.ssrLoadModule("/src/data/dmgkits.ts");
  const B = await server.ssrLoadModule("/src/lib/combat/battle.ts");
  const { game } = await server.ssrLoadModule("/src/data/game.ts");

  const frag = opt("kits");
  if (frag) {
    const f = JSON.parse(readFileSync(frag, "utf8"));
    Object.assign(kitsMod.dmgKits.characters, f.characters ?? {});
    Object.assign(kitsMod.dmgKits.lightCones, f.lightCones ?? {});
    Object.assign(kitsMod.dmgKits.relicSets, f.relicSets ?? {});
  }

  const skills = JSON.parse(readFileSync(new URL("../src/data/skills.json", import.meta.url), "utf8"));
  const make = (cid, eidolon, lc, sets) => {
    const info = game.characters[cid];
    const b = info?.base ?? {};
    const lcBase = lc ? game.lightCones[lc.id]?.base ?? {} : { atk: 500, hp: 1000, def: 400 };
    const el = info?.element ?? "Physical";
    const hp = (b.hp ?? 1000) + (lcBase.hp ?? 0);
    const atk = (b.atk ?? 600) + (lcBase.atk ?? 0);
    const def = (b.def ?? 500) + (lcBase.def ?? 0);
    const relics = [];
    for (const [setId, n] of sets) for (let i = 0; i < n; i++) relics.push({ setId, slot: "HEAD", rarity: 5, level: 15, main: { key: "HP", value: 705 }, subs: [] });
    const traces = Object.keys(skills.characters[cid]?.traces ?? {});
    return {
      id: cid,
      level: 80,
      eidolon,
      lightCone: lc,
      relics,
      traces,
      enhanced: args.includes("--enhanced") || undefined,
      finalStats: [
        { key: "HP", base: hp, bonus: hp * 0.6 + 700 },
        { key: "ATK", base: atk, bonus: atk * 0.8 + 350 },
        { key: "DEF", base: def, bonus: def * 0.3 + 50 },
        { key: "SPD", base: b.spd ?? 100, bonus: 35 },
        { key: "CR", base: 0.05, bonus: 0.65 },
        { key: "CD", base: 0.5, bonus: 0.9 },
        { key: "BE", base: 0, bonus: 0.6 },
        { key: "ELA", base: 0, bonus: info?.path === "Elation" ? 0.3 : 0 },
        { key: "ERR", base: 1, bonus: 0.1 },
        { key: "EHR", base: 0, bonus: 0.2 },
        { key: `${el}_DMG`, base: 0, bonus: 0.388 },
      ],
    };
  };

  const lcArg = opt("lc");
  const lc = lcArg ? { id: lcArg.split(":")[0], level: 80, superimposition: Number(lcArg.split(":")[1] ?? 1) } : undefined;
  const sets = (opt("sets", "") || "").split(",").filter(Boolean).map((s) => [s.split(":")[0], Number(s.split(":")[1] ?? 4)]);
  const main = make(id, Number(opt("e", 0)), lc, sets);
  const team = [main, ...(opt("team", "1101,1303,1217").split(",").filter((x) => x && x !== id).slice(0, 3).map((x) => make(x, 0, undefined, [])))];
  const members = team.map((c) => ({ char: c, skillEvery: null, ult: null, off: [], extraSpd: 0, target: c === main ? team[1]?.id : id }));
  const enemy = { level: 95, count: Number(opt("enemies", 3)), toughness: 160, spd: 150, res: 0.2, weak: "all" };

  let r;
  try {
    r = B.simulateBattle(members, enemy, Number(opt("cycles", 3)));
  } catch (e) {
    console.error("ENGINE ERROR:", e.stack ?? e);
    process.exit(2);
  }
  const warn = [];
  const by = B.damageByChar(r);
  const kit = kitsMod.dmgKits.characters[`${id}:e`] && main.enhanced ? kitsMod.dmgKits.characters[`${id}:e`] : kitsMod.dmgKits.characters[id];
  if (!kit) warn.push(`no damage kit for ${id}`);
  for (const d of r.damage) if (!Number.isFinite(d.amount)) warn.push(`non-finite damage from ${d.by} ${d.action}`);
  const mine = r.turns.filter((t) => t.key === id || t.owner === id);
  console.log(`${game.characters[id]?.name} (${id}) E${main.eidolon}${lc ? ` LC ${lc.id} S${lc.superimposition}` : ""}`);
  console.log(`turns: ${mine.map((t) => `${t.action}${t.ult ? "(ult)" : ""}${t.extra ? "(extra)" : ""}`).join(", ")}`);
  const s = by.get(id);
  console.log(`total damage: ${Math.round(s?.total ?? 0)}`);
  for (const [a, v] of Object.entries(s?.byAction ?? {})) console.log(`  ${a}: ${Math.round(v)}`);
  for (const [name, a] of Object.entries(kit?.actions ?? {})) {
    if (a.hits?.length && !(s?.byAction?.[name] > 0) && !(a.label && s?.byAction?.[a.label] > 0) && !["ult"].includes(name)) warn.push(`action ${name} has hits but dealt no damage in this run (maybe never used — check)`);
  }
  if (args.includes("--log")) for (const d of r.damage.filter((d) => d.key === id).slice(0, 40)) console.log(`  ${d.av.toFixed(1)} ${d.by} ${d.action} ${d.type} ${Math.round(d.amount)} ${JSON.stringify(d.parts ?? {})}`);
  const src = r.sources[id] ?? [];
  console.log(`effects applied: ${src.length} (${src.filter((x) => x.from !== "speed").length} from damage kits)`);
  if (warn.length) console.log("WARN:\n  " + [...new Set(warn)].join("\n  "));
} finally {
  await server.close();
}
