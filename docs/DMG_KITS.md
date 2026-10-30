# 딜 계산 키트 작성 가이드 (`src/data/dmgkits.json`)

The party simulator (파티 시뮬) computes damage from three things:

1. **The account**: HoYoLAB final stats, skill levels (eidolon bonus included), unlocked traces, eidolon, light cone and superimposition, relic sets.
2. **Game data** (`src/data/skills.json`, regenerated daily by `scripts/sync-gamedata.mjs`): every skill's params per level, trace params, light cone params per superimposition, each skill's toughness reduction and energy.
3. **Kits** (`src/data/dmgkits.json`, this guide): how each character, light cone and relic set behaves, written as data.

The engine is `src/lib/combat/battle.ts` (types in `src/data/dmgkits.ts`). Speed-only effects (action advance, SPD buffs, countdowns, Aha SPD) live in `src/data/speedkits.json` (see `docs/META_RESEARCH.md`) and are merged automatically; **do not repeat them in dmgkits.json**. The one exception is an Aha extra turn (`ahaExtraTurn`), which belongs in dmgkits because it carries a fixed Punchline amount.

## Rules (the owner rejects made-up data)

- **Numbers come from the game data.** Use references: `{ "skill": "<skill id>", "p": <index> }`, `{ "tree": "<trace id>", "p": <index> }`, `{ "lc": <index> }`. Run `node scripts/kit-text.mjs char <id>` — every number is printed as `«66%=p0»`, so `p0` is the index. Write literal numbers only for text that has no params (eidolons, relic sets, a few fixed numbers such as "3턴"), copied exactly from the Korean text.
- **Toughness and energy come from the game data too.** Put `"skill": "<id>"` on the action and `"toughness": "auto"` on its main hit. Leave `energy` out of actions (the data has it). Write numbers yourself only when a hit has no data (e.g. an eidolon follow-up); if the text doesn't say, leave toughness out and list it in `missing`.
- **Never guess.** If something cannot be expressed or you are not sure how it works, leave it out and say so in `missing` (shown to players, in Korean, short). If it depends on something the simulator does not track (enemy HP, kills, hits taken, healing), either leave it out or add it with `"assume": "<조건>"` so players see it as an assumption they can switch off.
- `note` is shown to players: short Korean, no source/site names. Start with where it comes from: `전투 스킬:`, `필살기:`, `특성:`, `행적:`, `1성혼:`, `광추:`, `4세트:`.
- Always-on stats (trace stat bonuses, a light cone's or set's plain stat bonus such as "치명타 확률 18% 증가" with no condition, 2-piece stat bonuses) are **already included** in the HoYoLAB totals. Do not add them. `kit-text.mjs` marks these as "always-on stats".
- Validate with `node scripts/check-kits.mjs <file>` and try with `node scripts/try-kit.mjs <id> --kits <file> --e 6` (also `--e 0`, `--lc <id>:1`, `--sets <id>:4`, `--team a,b,c`, `--enhanced`, `--log`).

## Kit format

```jsonc
"1204": {
  "scale": "ATK",              // stat the hits scale from (ATK / HP / DEF)
  "prefer": "skill",           // per-turn default: "skill" (uses SP) or "basic"
  "actions": { ... },          // must have basic, skill, ult
  "states": [ ... ],           // enhanced modes, barriers, transformations
  "counters": { ... },         // stacks and charges
  "summons": [ ... ],          // units with their own turns (Lightning-Lord, memosprites, Numby)
  "ultCost": { "counter": "x", "n": 9 },   // ultimate paid with a counter instead of energy
  "effects": [ ... ],
  "missing": ["(한국어) 계산하지 않은 효과"]
}
```

Enhanced (reworked) versions: when the game data has skills starting with `1<id>` (e.g. `1121701` for 곽향), the account may use either version. Write the original as `"<id>"` and the enhanced one as `"<id>:e"` (it uses the `1<id>…` skill and trace ids). `kit-text.mjs` prints a NOTE when this applies.

### Actions

```jsonc
"basic": { "type": "basic", "skill": "120401", "sp": 1,
           "hits": [{ "mult": { "skill": "120401", "p": 0 }, "toughness": "auto" }] },
"skill": { "type": "skill", "skill": "120402", "sp": -1,
           "hits": [{ "mult": { "skill": "120402", "p": 0 }, "area": "aoe", "toughness": "auto" }] },
"ult":   { "type": "ult", "skill": "120403", "hits": [ ... ] },
"followup": { "type": "followup", "hits": [ ... ] }
```

- `type`: `basic | skill | ult | followup | dot | additional | elation | memosprite | summon`. Damage bonuses filter on it.
- `sp`: +1 for a basic attack that recovers a skill point, −1 for a skill that spends one, 0 / omitted otherwise (enhanced basics often recover none: check the text).
- `ally: true` for actions that target allies and deal no damage (supports' skills / ultimates). `notAttack: true` for damage that "is not considered an attack" (공격으로 간주하지 않는다), extra Elation hits and the like.
- `before`: effects applied right before the hits (a debuff that the same action benefits from).
- `punchline`: Punchline gained (Elation), Value.
- Names other than basic/skill/ult are free (`followup`, `enhancedBasic`, `wolfTime`…). Give those a `label` (Korean name shown in the damage breakdown, e.g. `"label": "강화 일반 공격"`, `"추가 공격"`, `"신군"`). The Aha Instant uses each Elation character's action named `elation`.

### Hits

```jsonc
{ "mult": Value, "scale": "HP", "area": "single|blast|aoe|bounce|split",
  "adjMult": Value,          // blast: multiplier on adjacent targets
  "bounces": Value,          // bounce: number of bounces (spread evenly over enemies)
  "toughness": "auto",       // or a number in display units (10 = basic attack); adjToughness for blast
  "types": ["followup"],     // extra damage types on top of the action's
  "element": "Fire",         // when different from the character's
  "elation": true,           // Elation DMG formula (level multiplier, Punchline; no DMG boost)
  "punch": "banger",         // Elation: use the attacker's Certified Banger amount (or a fixed number)
  "punchMul": Value,         // Elation: "counts N× Punchline"
  "noCrit": true,
  "ignoreWeak": true,        // toughness reduction regardless of weakness
  "breakRatio": Value,       // "X% of <element> Break DMG" (break formula; maxToughness caps the enemy toughness used)
  "cond": Cond }             // hit happens only when the condition holds
```

- The main target is the middle enemy (blast hits both neighbours).
- `split`: damage "shared equally by all enemies" (모든 적이 균등 분담) — total is the multiplier once.
- `bounce`: random single-target bounces; the simulator spreads them evenly (expected value).
- Multi-part attacks are several hits. "피해를 N회 가한다" on one target = one hit with the multiplier × N (`{ "mul": [N, …] }`), or `bounce` when the target is random.

### Effects

```jsonc
{ "on": "skill", "to": "ally", "stat": "DMG%", "value": { "skill": "110102", "p": 0 }, "dur": 1, "note": "전투 스킬: 대상이 가하는 피해 증가 (1턴)" }
{ "on": "allyAttack", "do": "action", "ref": "followup", "limit": { "perTurn": 1 }, "note": "특성: 아군 공격 후 추가 공격" }
```

Exactly one of `stat` (a buff/debuff) or `do` (something happens).

**Triggers (`on`)**, from the effect owner's point of view:

| on | fires |
|---|---|
| `passive` | always (stat effects only; conditions are checked live at every hit) |
| `start` | battle start |
| `turnStart` / `turnEnd` | owner's own turn |
| `basic` `skill` `ult` `followup` `elation` `memosprite` | after the owner's own action of that type |
| `action:<name>` | after the owner's action with that name |
| `attack` | after any own attack |
| `allyAttack` `allySkill` `allyUlt` `allyBasic` `allyAction` | after another ally's action (not the owner's) |
| `anyAttack` `anyUlt` | after anyone's, owner included |
| `enemyTurn` | an enemy's turn starts (after DoTs tick) |
| `break` / `selfBreak` | any ally / the owner breaks an enemy |
| `aha` | an Aha Instant ends (`{ev:"amount"}` = Punchline used) |
| `punchline` | the team gains Punchline (`{ev:"amount"}` = how much) |
| `spSpent` | anyone spends skill points (`{ev:"amount"}`) |
| `counter:<id>` | the owner's counter reached its threshold |
| `summon:<id>` | the owner's summon acted |
| `before:<type>` / `before:action:<name>` / `before:attack` | right before the owner's own action deals its hits ("발동 시 이번 공격의 피해 증가": pair with `consume` or `dur: 1`) |

For attacks, `{ev:"amount"}` is the skill points that attack spent (so `"cond": {"ev": {"gte": 1}}` = "an attack that consumed skill points").

**Targets (`to`)**: `self` (default), `ally` (the single ally the player picks), `team`, `others`, `source` (who caused the trigger), `enemy` (main target), `enemies`, `path:<Path>`, `element:<Element>`, `summon:<id>`.

**Stats**: `HP ATK DEF SPD` (flat), `HP% ATK% DEF% SPD%` (of base), `CR CD BE ERR EHR OHB ELA` (ratios, 0.12 = 12%), `Merrymake` (증소), `DMG%`, `DEFIgnore`, `RESPen`, `multAdd` (adds to the ability multiplier), `finalMult` (independent multiplier: "피해가 기존의 150%" → 0.5), `breakDMG%`, `superBreakDMG%`, `superBreak` (converts toughness reduction into Super Break DMG at this ratio while the enemy is broken), `breakEff`. On enemies (`to: enemy/enemies`): `DEFDown`, `RESDown`, `Vuln` (받는 피해 증가), `SPD%` (negative = slow).
Filter damage stats with `types` (e.g. `["followup"]`, `["ult"]`) and `element`.

**Durations**: `dur` = turns of the holder (counted at the end of the holder's turn; a buff gained during the holder's own turn does not count that turn). `"durOn": "owner"` counts the owner's turns instead (for "지속 시간 N턴, 자신의 턴이 시작될 때마다 1 감소"-style auras). A triggered stat buff without `dur` lasts the whole battle — the validator only allows that with `stack` or `limit.total` (otherwise make it `passive`). `consume: ["ult"]` (or `"attack"`) removes the buff after the holder's next action of that type ("다음 공격 시 …, 공격 후 해제"). `stack: N` adds a stack each time it fires (value is per stack, max N). Same `id` = same buff (the newer one replaces it and refreshes the duration). Elation-formula hits always carry the `elation` damage type.

**do**: `advance` (action advance; enemies take a delay with a negative value — speed effects for allies belong in speedkits), `energy` (scaled by the holder's energy regeneration; add `"fixed": true` for "고정" amounts), `energyPct` (ratio of the holder's max energy), `sp`, `maxSp` (raise the skill point cap, e.g. on start), `punchline`, `banger` / `bangerExtend` (Elation Certified Banger points / turns), `extraTurn` (`ref` = action name, default the normal choice), `ahaExtraTurn` (value = fixed Punchline), `action` (owner performs `ref` now, e.g. a follow-up), `counter` / `setCounter` (`ref` = counter id), `state` / `endState` / `stateUses` (`ref` = state id), `dmg` (`hits`: immediate extra damage, type from the hit's first type or "additional"), `dot` (`dot: {mult, scale, element, dur, id}`: DoT on the targets, ticks at the enemy's turn start; same id replaces, re-applying never shortens), `detonate` (all DoTs on the targets deal `value` × their damage now; `ref: "own"` = only the owner's), `toughness` (reduce toughness regardless of weakness), `summon` (activate summon `ref`), `unstack` (remove `value` stacks of the buff with id `ref` from the targets).

**Gates**: `rank` (eidolon needed), `maxRank` (not from that eidolon on — for an effect a higher eidolon replaces), `trace` (trace point id that must be unlocked, e.g. `"1204103"`), `pieces` (relic sets: 2 or 4), `limit: {perTurn, total}`, `chance` (Value; scales damage; buffs below 50% are scaled by the chance), `label` (do: dmg / dot: short name for the damage breakdown), `after: true` (buff starts after the holder's next action), `assume` (condition the player can switch off).

### Values

`number` · `{skill,p}` · `{tree,p}` · `{lc}` · `{stat, of: "owner"|"holder"|"source", base, without: [buff ids]}` · `{add:[…]}` `{mul:[…]}` `{sub:[a,b]}` `{div:[a,b]}` `{min:[…]}` `{max:[…]}` `{floor:v}` · `{steps:{stat, over, per, max}}` (number of full steps above a threshold) · `{count:"path:Elation"|"element:Fire"|"enemies"|"team"|"debuffs"}` (debuffs = on the main target) · `{maxEnergy:"owner"|"holder"}` · `{counter:"id"}` · `{pick:[…], by:v}` · `{ev:"amount"}` · `{rank:N}` (1 if the owner has eidolon N) · `{trace:"<point id>"}` (1 if unlocked) · `{gte:[a,b]}` (1 or 0) · `{punch:"team"}` `{sp:"team"}` `{banger:"self"}` (current amounts). `{tree}` gives 0 while the trace is locked.

Use `without` when a buff is "X% of the caster's stat" and the caster also gets it (avoids counting the buff in itself), e.g. Bronya's ultimate CD buff.

### Conditions (`cond`)

`broken` (main target broken) · `stat: {key, of, gte, lte}` · `count: {of, gte, lte}` · `counter: {id, gte, lte}` · `state` / `notState` · `debuffs: {gte}` (on the main target) · `path` / `notPath` / `maxEnergy` / `holder` (checked per target) · `banger` (owner has Certified Banger) · `weak: "<Element>"` · `ahaExtra` (inside the owner's Aha extra turn) · `ev: {gte, lte}` · `source: Cond` (checked on the unit that caused the trigger, e.g. `{"source": {"path": "Hunt"}}`) · `chosen` (holder is the owner's chosen ally; `{"source": {"chosen": true}}` = the trigger came from the chosen ally) · `all` / `any`.

### States

```jsonc
"states": [{ "id": "invincible", "name": "무적 플레이어",
  "replace": { "basic": "wolfTime" },   // action swaps while active
  "force": "basic",                     // action used every turn while active (before replace)
  "uses": 3,                            // ends after 3 replaced actions
  "dur": Value, "tickOn": "start",      // or ends after N owner turns (counted at turn start or end)
  "blockUlt": true, "skipTurns": false,
  "effects": [ /* passive stat effects while active; triggered effects also allowed */ ],
  "onEnd": [ /* effects when it ends */ ] }]
```

### Counters and summons

```jsonc
"counters": { "ll": { "max": 7, "start": 0 },
              "stack": { "at": 8, "repeat": true, "then": [ { "on": "counter:stack", "do": "action", "ref": "followup", "note": "…" } ] } },
"summons": [{ "id": "ll", "name": "신군", "spd": { "add": [{ "skill": "120404", "p": 0 }, { "mul": [{ "counter": "ll" }, { "skill": "120404", "p": 2 }] }] }, "action": "llAttack" }]
```

A summon acts on its own action gauge with `action` from the owner's actions (hits use the owner's stats; buffs aimed at `summon:<id>` apply only to it). Use `"on": "summon:ll"` effects for "after the summon acts" (e.g. reset its stacks).

### Elation (환락)

With an Elation character in the party, Aha joins the action bar (SPD from `speedkits`/engine). On Aha's turn every Elation character uses its `elation` action with the team's Punchline (`punch` defaults to it), then gains Certified Banger (훌륭한 솜씨에는 보상을) equal to the Punchline used, for 2 turns; Punchline resets to the number of Elation characters. Ordinary Elation hits outside Aha use the attacker's Certified Banger (`"punch": "banger"`). `ahaExtraTurn` triggers an Instant with a fixed Punchline that does not reset anything. 증소 is the stat `Merrymake`.

## Reference kits

`1101` 브로냐 (support buffs, eidolon follow-up), `1217` / `1217:e` 곽향 (HP scaling, states, base/enhanced versions), `1502` 효광 (Elation support: barrier state, Aha extra turn, talent procs), `1506` 은랑 LV.999 (counters driving CR/CD, enhanced state with forced actions, ult paid with a counter). Read them before writing a new kit.

## Light cones and relic sets

```jsonc
"lightCones": { "23063": { "effects": [ { "on": "ult", "do": "sp", "value": 1, "note": "광추: 필살기 후 전투 스킬 포인트 1pt 회복" } ] } },
"relicSets":  { "102":   { "effects": [ { "pieces": 4, "on": "passive", "stat": "CD", "value": 0.25, "types": ["followup"], "note": "4세트: …" } ] } }
```

Light cone numbers use `{ "lc": <index> }` (the equipped superimposition is applied). Relic set numbers are literal from the text. Owner = the wearer.
