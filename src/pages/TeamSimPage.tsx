import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { dmgKits } from "../data/dmgkits";
import { asset, ELEMENT_COLORS, game } from "../data/game";
import {
  cycleEnd,
  damageByChar,
  kitOf,
  simulateBattle,
  sourcesFor,
  type BattleResult,
  type EnemySetup,
  type MemberSetup,
  type Source,
  type TurnEvent,
} from "../lib/combat/battle";
import { statTotal } from "../lib/stats";
import type { Account, ElementId, OwnedCharacter } from "../types";
import "../styles/tools.css";
import "../styles/teamsim.css";
import "../styles/battle.css";

const TEAM_KEY = "sra.teamsim.team";
const CFG_KEY = "sra.teamsim.cfg";
const ENEMY_KEY = "sra.teamsim.enemy";
const MODE_KEY = "sra.teamsim.mode";

/** Per-character choices, remembered between visits. */
interface UnitCfg {
  /** Manual SPD bonus */
  extra: number;
  /** Skill every N turns (0 = never), missing = the kit's default */
  skillEvery: number | null;
  /** Ultimate every N turns, 0 = never, null = when energy is full */
  ult: number | null;
  /** Single-target effects go to this character */
  target?: string;
  /** Effects turned off by the player */
  off: string[];
}

type Mode = "speed" | "damage" | "play";

const DEFAULT_ENEMY: EnemySetup = { level: 95, count: 3, toughness: 160, spd: 150, res: 0.2, weak: "all" };
const ELEMENTS: ElementId[] = ["Physical", "Fire", "Ice", "Thunder", "Wind", "Quantum", "Imaginary"];

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // ignore
  }
}

const icon = (id: string) => {
  const p = game.characters[id]?.icon;
  return p ? asset(p) : "";
};
const nameOf = (id: string) => game.characters[id]?.name ?? id;
const colorOf = (id: string) => {
  if (id === "aha") return "#ef7fb4";
  const el = game.characters[id.split(":")[0]]?.element;
  return el ? ELEMENT_COLORS[el] : "#dcbc7c";
};
const fmt = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
/** 1234567 → "123.5만" */
function fmtDmg(v: number) {
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}억`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(1)}만`;
  return Math.round(v).toLocaleString();
}

const ACTION_NAMES: Record<string, string> = {
  basic: "일반 공격",
  skill: "전투 스킬",
  ult: "필살기",
  elation: "환락 스킬",
  followup: "추가 공격",
  skip: "턴 넘김",
  aha: "아하 타임",
};
const actionName = (a: string) => ACTION_NAMES[a] ?? a;

const SOURCE_GROUP: Record<Source["from"], string> = { kit: "캐릭터", speed: "속도", lc: "광추", set: "성유물" };

/** Face for characters, summons (owner's face) and Aha */
function Face({ id, kind }: { id: string; kind?: string }) {
  if (id === "aha") return <span className="aha-face">아하</span>;
  if (kind === "enemy" || id.startsWith("enemy")) return <span className="enemy-face">적</span>;
  const base = id.split(":")[0];
  return <img src={icon(base)} alt="" className={kind === "summon" ? "summon" : ""} />;
}

/** Teams the player used in end-game content, newest first, keeping only owned characters. */
function recentTeams(account: Account, owned: Set<string>) {
  const out: { label: string; ids: string[] }[] = [];
  const seen = new Set<string>();
  const names = { moc: "혼돈", pf: "허구", as: "종말" } as const;
  for (const when of ["current", "previous"] as const) {
    for (const kind of ["moc", "pf", "as"] as const) {
      const period = account.challenges?.[when]?.[kind];
      period?.floors.slice(0, 1).forEach((f) =>
        f.teams.forEach((t, i) => {
          const ids = t.avatars.map((a) => a.id).filter((id) => owned.has(id));
          const key = [...ids].sort().join(",");
          if (ids.length && !seen.has(key)) {
            seen.add(key);
            out.push({ label: `${names[kind]} ${i + 1}팀`, ids });
          }
        }),
      );
    }
  }
  return out.slice(0, 6);
}

/** Smallest extra SPD that gives one more action within the shown cycles. */
function nextBreakpoint(members: MemberSetup[], enemy: EnemySetup, cycles: number, key: string) {
  const count = (extra: number) =>
    simulateBattle(
      members.map((m) => (m.char.id === key ? { ...m, extraSpd: m.extraSpd + extra } : m)),
      enemy,
      cycles,
    ).turns.filter((t) => t.key === key && !t.ult && !t.extra).length;
  const have = count(0);
  let lo = 0;
  let hi = -1;
  for (let s = 2; s <= 40; s += 2) {
    if (count(s) > have) {
      hi = s;
      break;
    }
    lo = s;
  }
  if (hi < 0) return null;
  // Narrow down to 0.1
  while (hi - lo > 0.1 + 1e-9) {
    const mid = Math.round(((lo + hi) / 2) * 10) / 10;
    if (mid <= lo || mid >= hi) break;
    if (count(mid) > have) hi = mid;
    else lo = mid;
  }
  return { extra: hi, actions: have + 1 };
}

const spdFor = (actions: number, cycle: number) => (actions * 10000) / cycleEnd(cycle);
const BREAKPOINTS = [
  { spd: spdFor(2, 0), label: "0사이클 2회 행동" },
  { spd: spdFor(3, 1), label: "1사이클까지 3회 행동" },
  { spd: spdFor(4, 1), label: "1사이클까지 4회 행동" },
  { spd: spdFor(5, 2), label: "2사이클까지 5회 행동" },
  { spd: spdFor(6, 2), label: "2사이클까지 6회 행동" },
];

export function TeamSimPage({ account }: { account: Account }) {
  const chars = account.characters;
  const byId = useMemo(() => new Map(chars.map((c) => [c.id, c])), [chars]);
  const presets = useMemo(() => recentTeams(account, new Set(byId.keys())), [account, byId]);

  const [team, setTeamState] = useState<string[]>(() => {
    const saved = load<string[]>(TEAM_KEY, []).filter((id) => byId.has(id));
    if (saved.length) return saved;
    return presets[0]?.ids ?? chars.slice(0, 4).map((c) => c.id);
  });
  const [cfgs, setCfgs] = useState<Record<string, Partial<UnitCfg>>>(() => load(CFG_KEY, {}));
  const [enemy, setEnemyState] = useState<EnemySetup>(() => ({ ...DEFAULT_ENEMY, ...load<Partial<EnemySetup>>(ENEMY_KEY, {}) }));
  const [mode, setModeState] = useState<Mode>(() => load<Mode>(MODE_KEY, "damage"));
  const [cycles, setCycles] = useState(5);
  const [picking, setPicking] = useState<number | null>(null);

  const setTeam = (t: string[]) => {
    setTeamState(t);
    save(TEAM_KEY, t);
  };
  const setCfg = (id: string, patch: Partial<UnitCfg>) => {
    const next = { ...cfgs, [id]: { ...cfgs[id], ...patch } };
    setCfgs(next);
    save(CFG_KEY, next);
  };
  const setEnemy = (patch: Partial<EnemySetup>) => {
    const next = { ...enemy, ...patch };
    setEnemyState(next);
    save(ENEMY_KEY, next);
  };
  const setMode = (m: Mode) => {
    setModeState(m);
    save(MODE_KEY, m);
  };

  const members = team.map((id) => byId.get(id)).filter((c): c is OwnedCharacter => !!c);

  const setups: MemberSetup[] = useMemo(
    () =>
      members.map((c) => {
        const cfg = cfgs[c.id] ?? {};
        const others = members.filter((m) => m.id !== c.id).map((m) => m.id);
        return {
          char: c,
          skillEvery: cfg.skillEvery ?? null,
          ult: cfg.ult === undefined ? null : cfg.ult,
          target: cfg.target && others.includes(cfg.target) ? cfg.target : others[0],
          off: cfg.off ?? [],
          extraSpd: cfg.extra ?? 0,
        };
      }),
    [JSON.stringify(team), cfgs, chars],
  );

  const result = useMemo(() => simulateBattle(setups, enemy, cycles), [setups, enemy, cycles]);
  const dmg = useMemo(() => damageByChar(result), [result]);

  // Breakpoints take a few dozen runs per character: compute them after the first paint
  const [breakpoints, setBreakpoints] = useState<Record<string, { extra: number; actions: number } | null>>({});
  useEffect(() => {
    setBreakpoints({});
    if (mode !== "speed") return;
    let cancelled = false;
    let i = 0;
    const step = () => {
      if (cancelled || i >= setups.length) return;
      const key = setups[i].char.id;
      const bp = nextBreakpoint(setups, enemy, cycles, key);
      setBreakpoints((b) => ({ ...b, [key]: bp }));
      i++;
      setTimeout(step, 0);
    };
    const t = setTimeout(step, 50);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [setups, enemy, cycles, mode]);

  if (!chars.length) {
    return (
      <div className="page tool-page">
        <div className="tool-empty">
          <h2>캐릭터가 없어요</h2>
          HoYoLAB을 연동하면 보유 캐릭터의 실제 능력치로 계산해요.
        </div>
      </div>
    );
  }

  const teamTotal = [...dmg.values()].reduce((a, s) => a + s.total, 0);

  return (
    <div className="page tool-page teamsim-page">
      <div className="tool-top">
        <div className="presets">
          <span className="tool-note" title="게임 안의 현재 파티 구성은 HoYoLAB에서 제공하지 않아서, 엔드 컨텐츠에서 실제로 쓴 파티를 불러와요.">
            엔드 컨텐츠에서 쓴 파티
          </span>
          {presets.map((p) => (
            <button key={p.label} className="tool-btn small" onClick={() => setTeam(p.ids)}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="tool-status" />
        <div className="tseg">
          {(
            [
              ["damage", "딜 계산"],
              ["speed", "속도·턴"],
              ["play", "전투 재생"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
        <div className="tseg">
          {[3, 5, 10].map((n) => (
            <button key={n} className={cycles === n ? "on" : ""} onClick={() => setCycles(n)}>
              {n}사이클
            </button>
          ))}
        </div>
      </div>

      <EnemyBar enemy={enemy} setEnemy={setEnemy} />

      <div className="ts-slots">
        {[0, 1, 2, 3].map((i) => {
          const c = members[i];
          const s = setups[i];
          return (
            <SlotCard
              key={i}
              c={c}
              setup={s}
              cfg={c ? (cfgs[c.id] ?? {}) : {}}
              setCfg={(p) => c && setCfg(c.id, p)}
              others={members.filter((m) => m.id !== c?.id)}
              result={result}
              total={c ? (dmg.get(c.id)?.total ?? 0) : 0}
              share={c && teamTotal > 0 ? (dmg.get(c.id)?.total ?? 0) / teamTotal : 0}
              bp={c ? breakpoints[c.id] : undefined}
              showBp={mode === "speed"}
              picking={picking === i}
              onPick={() => setPicking(picking === i ? null : i)}
              onRemove={() => c && setTeam(team.filter((x) => x !== c.id))}
              chars={chars}
              team={team}
              onChoose={(id) => {
                // Swap when the character already sits in another slot
                const next = [...team];
                const from = next.indexOf(id);
                if (i < next.length) {
                  if (from >= 0) next[from] = next[i];
                  next[i] = id;
                } else {
                  if (from >= 0) next.splice(from, 1);
                  next.push(id);
                }
                setTeam(next.slice(0, 4));
                setPicking(null);
              }}
            />
          );
        })}
      </div>

      {members.length > 0 && mode === "damage" && <DamageView result={result} cycles={cycles} members={members} />}
      {members.length > 0 && mode === "speed" && <SpeedView result={result} cycles={cycles} />}
      {members.length > 0 && mode === "play" && <Playback result={result} />}
    </div>
  );
}

// ---------- Enemy settings ----------

function EnemyBar({ enemy, setEnemy }: { enemy: EnemySetup; setEnemy: (p: Partial<EnemySetup>) => void }) {
  const weakAll = enemy.weak === "all";
  const weakList = weakAll ? [] : (enemy.weak as ElementId[]);
  const toggle = (e: ElementId) => {
    const next = weakList.includes(e) ? weakList.filter((x) => x !== e) : [...weakList, e];
    setEnemy({ weak: next });
  };
  return (
    <div className="tool-card enemy-bar">
      <span className="eb-title">적</span>
      <label>
        레벨
        <input className="num-input" type="number" min={1} max={120} value={enemy.level} onChange={(e) => setEnemy({ level: Number(e.target.value) || 1 })} />
      </label>
      <label>
        수
        <span className="tseg mini">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={enemy.count === n ? "on" : ""} onClick={() => setEnemy({ count: n })}>
              {n}
            </button>
          ))}
        </span>
      </label>
      <label title="적 1기의 강인성 최대치">
        강인성
        <input
          className="num-input"
          type="number"
          min={10}
          step={10}
          value={enemy.toughness}
          onChange={(e) => setEnemy({ toughness: Math.max(10, Number(e.target.value) || 10) })}
        />
      </label>
      <label>
        속도
        <input className="num-input" type="number" min={1} value={enemy.spd} onChange={(e) => setEnemy({ spd: Math.max(1, Number(e.target.value) || 1) })} />
      </label>
      <label title="약점이 아닌 속성의 저항">
        저항
        <input
          className="num-input"
          type="number"
          step={5}
          value={Math.round(enemy.res * 100)}
          onChange={(e) => setEnemy({ res: (Number(e.target.value) || 0) / 100 })}
        />
        %
      </label>
      <div className="eb-weak">
        약점
        <button className={`chip ${weakAll ? "on" : ""}`} onClick={() => setEnemy({ weak: weakAll ? [] : "all" })}>
          모두
        </button>
        {ELEMENTS.map((e) => (
          <button
            key={e}
            className={`chip el ${!weakAll && weakList.includes(e) ? "on" : ""}`}
            style={{ ["--el" as string]: ELEMENT_COLORS[e] }}
            onClick={() => (weakAll ? setEnemy({ weak: [e] }) : toggle(e))}
            title={game.elements[e]?.name ?? e}
          >
            <img src={asset(game.elements[e]?.icon ?? "")} alt={e} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Character slot ----------

function SlotCard(props: {
  c?: OwnedCharacter;
  setup?: MemberSetup;
  cfg: Partial<UnitCfg>;
  setCfg: (p: Partial<UnitCfg>) => void;
  others: OwnedCharacter[];
  result: BattleResult;
  total: number;
  share: number;
  bp?: { extra: number; actions: number } | null;
  showBp: boolean;
  picking: boolean;
  onPick: () => void;
  onRemove: () => void;
  chars: OwnedCharacter[];
  team: string[];
  onChoose: (id: string) => void;
}) {
  const { c, setup, cfg, setCfg, others, result } = props;
  const [showMissing, setShowMissing] = useState(false);
  const sources = useMemo(() => (c ? sourcesFor(c, cfg.off ?? []) : []), [c, cfg.off]);
  const kit = c ? kitOf(c) : undefined;
  const actions = c ? result.turns.filter((t) => t.key === c.id && !t.ult && !t.extra && t.action !== "skip").length : 0;
  const hasAlly = sources.some((s) => s.eff.to === "ally");
  const missing = [...(kit?.missing ?? []), ...(c?.lightCone ? (dmgKits.lightCones[c.lightCone.id]?.missing ?? []) : [])];
  const groups = (["kit", "speed", "lc", "set"] as Source["from"][])
    .map((g) => [g, sources.filter((s) => s.from === g)] as const)
    .filter(([, l]) => l.length);

  return (
    <div className={`ts-slot tool-card ${c ? "" : "empty"}`} style={{ ["--glow" as string]: c ? colorOf(c.id) + "66" : undefined }}>
      <div className="ts-main">
        <button className="ts-face" onClick={props.onPick} title="캐릭터 바꾸기">
          {c ? <img src={icon(c.id)} alt="" /> : <span>+</span>}
        </button>
        {c && setup ? (
          <div className="ts-info">
            <div className="ts-name">
              <b>
                {nameOf(c.id)} <small className="num">{c.eidolon}돌</small>
              </b>
              <button className="ts-x" onClick={props.onRemove} title="빼기">
                ×
              </button>
            </div>
            <div className="ts-spd">
              <span>속도</span>
              <b className="num">{fmt(statTotal(c, "SPD") + (cfg.extra ?? 0))}</b>
              <label title="계산에 없는 버프를 속도로 더해 보세요">
                +
                <input className="num-input" type="number" step={1} value={cfg.extra ?? 0} onChange={(e) => setCfg({ extra: Number(e.target.value) || 0 })} />
              </label>
            </div>
            <div className="ts-foot">
              {actions}회 행동
              {props.total > 0 && (
                <>
                  {" · "}딜 <b className="num">{fmtDmg(props.total)}</b> <span className="share">{Math.round(props.share * 100)}%</span>
                </>
              )}
              {props.showBp &&
                (props.bp === undefined ? (
                  <span className="bp">다음 속도 구간 계산 중…</span>
                ) : props.bp ? (
                  <span className="bp">
                    속도 <b className="num">+{fmt(props.bp.extra)}</b> → {props.bp.actions}회
                  </span>
                ) : null)}
            </div>
          </div>
        ) : (
          <div className="ts-info tool-note">캐릭터를 골라 주세요</div>
        )}
      </div>

      {c && setup && (
        <div className="ts-cfg">
          {!kit && <div className="ts-nokit">딜 계산 데이터가 아직 없어 속도만 계산해요</div>}
          <label>
            전투 스킬
            <select
              value={cfg.skillEvery == null ? "auto" : String(cfg.skillEvery)}
              onChange={(e) => setCfg({ skillEvery: e.target.value === "auto" ? null : Number(e.target.value) })}
            >
              <option value="auto">기본 ({kit?.prefer === "basic" ? "일반 공격 위주" : "매 턴"})</option>
              <option value={1}>매 턴</option>
              <option value={2}>2턴마다</option>
              <option value={3}>3턴마다</option>
              <option value={0}>안 씀</option>
            </select>
          </label>
          <label>
            필살기
            <select
              value={cfg.ult === undefined || cfg.ult === null ? "auto" : String(cfg.ult)}
              onChange={(e) => setCfg({ ult: e.target.value === "auto" ? null : Number(e.target.value) })}
            >
              <option value="auto">{kit?.ultCost ? "조건이 차면 바로" : "에너지가 차면 바로"}</option>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}턴마다
                </option>
              ))}
              <option value="0">안 씀</option>
            </select>
          </label>
          {hasAlly && others.length > 0 && (
            <label>
              대상
              <select value={setup.target} onChange={(e) => setCfg({ target: e.target.value })}>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {nameOf(o.id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ul className="ts-effects">
            {sources.length === 0 && <li className="none">적용되는 효과 없음</li>}
            {groups.map(([g, list]) => (
              <li key={g} className="grp">
                <span className="grp-name">{SOURCE_GROUP[g]}</span>
                <ul>
                  {list.map((s) => (
                    <li key={s.id}>
                      <button
                        className={s.on ? "on" : ""}
                        onClick={() => setCfg({ off: s.on ? [...(cfg.off ?? []), s.id] : (cfg.off ?? []).filter((x) => x !== s.id) })}
                        title={s.on ? "누르면 빼고 계산" : "누르면 넣고 계산"}
                      >
                        <i>{s.on ? "✓" : ""}</i>
                        <span>
                          {s.eff.note}
                          {s.eff.assume && <em className="assume">가정: {s.eff.assume}</em>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {missing.length > 0 && (
            <div className="ts-missing">
              <button onClick={() => setShowMissing(!showMissing)}>
                계산에서 빠진 효과 {missing.length}개 {showMissing ? "▴" : "▾"}
              </button>
              {showMissing && (
                <ul>
                  {missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {props.picking && (
          <motion.div className="picker" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {[...props.chars]
              .sort((a, b) => statTotal(b, "SPD") - statTotal(a, "SPD"))
              .map((o) => (
                <button key={o.id} className={props.team.includes(o.id) ? "in" : ""} onClick={() => props.onChoose(o.id)}>
                  <img src={icon(o.id)} alt="" loading="lazy" />
                  <span>{nameOf(o.id)}</span>
                  <b className="num">{fmt(statTotal(o, "SPD"))}</b>
                </button>
              ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Damage ----------

const TYPE_NAMES: Record<string, string> = {
  basic: "일반 공격",
  skill: "전투 스킬",
  ult: "필살기",
  followup: "추가 공격",
  dot: "지속 피해",
  additional: "부가 피해",
  elation: "환락",
  memosprite: "기억 정령",
  summon: "소환물",
  break: "격파",
  superBreak: "슈퍼 격파",
};

function DamageView({ result, cycles, members }: { result: BattleResult; cycles: number; members: OwnedCharacter[] }) {
  const by = damageByChar(result);
  const total = [...by.values()].reduce((a, s) => a + s.total, 0);
  const max = Math.max(1, ...[...by.values()].map((s) => s.total));
  const perCycle = Array.from({ length: cycles }, (_, c) => {
    const from = c === 0 ? -1 : cycleEnd(c - 1);
    const to = cycleEnd(c);
    const row: Record<string, number> = {};
    for (const d of result.damage) if (d.av > from + 1e-9 && d.av <= to + 1e-9) row[d.key] = (row[d.key] ?? 0) + d.amount;
    return row;
  });
  const cycleMax = Math.max(1, ...perCycle.map((r) => Object.values(r).reduce((a, b) => a + b, 0)));
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <div className="dmg-top">
        <div className="tool-card dmg-total">
          <h3>
            파티 총 피해 <small>{cycles}사이클 · 모든 적 합계</small>
          </h3>
          <b className="num big">{fmtDmg(total)}</b>
          <div className="dmg-sub">
            <span>
              사이클당 <b className="num">{fmtDmg(total / cycles)}</b>
            </span>
            <span title="행동치 1당 피해">
              행동치당 <b className="num">{fmtDmg(total / result.end)}</b>
            </span>
          </div>
          {result.noKit.length > 0 && (
            <p className="tool-note">{result.noKit.map(nameOf).join(", ")}: 딜 계산 데이터가 아직 없어 피해 없이 속도만 계산했어요.</p>
          )}
        </div>

        <div className="tool-card dmg-cycles">
          <h3>사이클별 피해</h3>
          <div className="cyc-bars">
            {perCycle.map((row, c) => {
              const sum = Object.values(row).reduce((a, b) => a + b, 0);
              return (
                <div key={c} className="cyc-col" title={`${c}사이클 ${fmtDmg(sum)}`}>
                  <div className="cyc-val num">{sum > 0 ? fmtDmg(sum) : ""}</div>
                  <motion.div className="cyc-stack" initial={{ height: 0 }} animate={{ height: `${(sum / cycleMax) * 100}%` }}>
                    {members.map((m) => (row[m.id] ? <i key={m.id} style={{ flexGrow: row[m.id], background: colorOf(m.id) }} /> : null))}
                  </motion.div>
                  <span className="num">{c}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="tool-card dmg-chars">
        <h3>
          캐릭터별 피해 <small>누르면 행동별로 나눠 보여줘요</small>
        </h3>
        {members.map((m) => {
          const s = by.get(m.id);
          const t = s?.total ?? 0;
          const isOpen = open === m.id;
          return (
            <div key={m.id} className={`dmg-row ${isOpen ? "open" : ""}`}>
              <button className="dmg-head" onClick={() => setOpen(isOpen ? null : m.id)}>
                <img src={icon(m.id)} alt="" />
                <span className="who">{nameOf(m.id)}</span>
                <span className="bar">
                  <motion.i initial={{ width: 0 }} animate={{ width: `${(t / max) * 100}%` }} style={{ background: colorOf(m.id) }} />
                </span>
                <b className="num">{fmtDmg(t)}</b>
                <span className="share num">{total > 0 ? Math.round((t / total) * 100) : 0}%</span>
              </button>
              <AnimatePresence>
                {isOpen && s && (
                  <motion.div className="dmg-detail" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                    <div className="dd-cols">
                      <div>
                        <h4>행동별</h4>
                        {Object.entries(s.byAction)
                          .sort((a, b) => b[1] - a[1])
                          .map(([a, v]) => (
                            <div key={a} className="dd-line">
                              <span>{actionName(a)}</span>
                              <b className="num">{fmtDmg(v)}</b>
                              <small className="num">{Math.round((v / t) * 100)}%</small>
                            </div>
                          ))}
                      </div>
                      <div>
                        <h4>피해 유형별</h4>
                        {Object.entries(s.byType)
                          .sort((a, b) => b[1] - a[1])
                          .map(([a, v]) => (
                            <div key={a} className="dd-line">
                              <span>{TYPE_NAMES[a] ?? a}</span>
                              <b className="num">{fmtDmg(v)}</b>
                              <small className="num">{Math.round((v / t) * 100)}%</small>
                            </div>
                          ))}
                      </div>
                      <HitSample result={result} id={m.id} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        <p className="tool-note">
          HoYoLAB의 실제 능력치·스킬 레벨·행적·성혼·광추·성유물과 게임 데이터의 스킬 배율로 계산한 기대값이에요(치명타는 확률×피해로 평균). 적은 공격하지 않아서
          피격으로 얻는 에너지와 적 처치·HP 조건 효과는 빠져 있어요.
        </p>
      </div>
    </>
  );
}

/** The biggest single hit of a character with its multipliers, so players can see how it was computed. */
function HitSample({ result, id }: { result: BattleResult; id: string }) {
  const hits = result.damage.filter((d) => d.key === id && d.parts);
  if (!hits.length) return null;
  const top = hits.reduce((a, b) => (b.amount > a.amount ? b : a));
  const p = top.parts!;
  const rows: [string, string][] = [];
  if (p.base !== undefined) rows.push(["기본 피해 (능력치×배율)", fmtDmg(p.base)]);
  if (p.punch !== undefined) rows.push(["웃음 포인트", String(Math.round(p.punch))]);
  if (p.ela !== undefined) rows.push(["환락도 계수", `×${p.ela.toFixed(2)}`]);
  if (p.boost !== undefined) rows.push(["피해 증가", `×${p.boost.toFixed(2)}`]);
  rows.push(["치명타 기대값", `×${p.crit.toFixed(2)}`]);
  rows.push(["방어 계수", `×${p.def.toFixed(3)}`]);
  rows.push(["저항 계수", `×${p.res.toFixed(2)}`]);
  rows.push(["받는 피해 증가", `×${p.vuln.toFixed(2)}`]);
  rows.push(["강인성", p.broken >= 1 ? "격파됨 ×1.0" : "×0.9"]);
  return (
    <div>
      <h4>가장 큰 한 방 · {actionName(top.action)}</h4>
      {rows.map(([k, v]) => (
        <div key={k} className="dd-line">
          <span>{k}</span>
          <b className="num">{v}</b>
        </div>
      ))}
      <div className="dd-line strong">
        <span>적 1기 피해</span>
        <b className="num">{fmtDmg(top.amount)}</b>
      </div>
    </div>
  );
}

// ---------- Speed / turns ----------

function rowsOf(result: BattleResult) {
  const keys: { key: string; kind: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const t of result.turns) {
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    keys.push({ key: t.key, kind: t.kind, name: t.name });
  }
  const order = (k: { kind: string }) => (k.kind === "char" ? 0 : k.kind === "summon" ? 1 : 2);
  return keys.sort((a, b) => order(a) - order(b));
}

function SpeedView({ result, cycles }: { result: BattleResult; cycles: number }) {
  const end = result.end;
  const rows = rowsOf(result);
  const counts = (key: string) => {
    const out = Array.from({ length: cycles }, () => 0);
    for (const t of result.turns) if (t.key === key && !t.ult && t.cycle < cycles) out[t.cycle]++;
    return out;
  };
  return (
    <>
      <div className="tool-card timeline-card">
        <h3>
          행동 타임라인 <small>첫 사이클 150 · 이후 사이클마다 100 행동치 · ◆ 필살기 · ○ 보너스 턴</small>
        </h3>
        <div className="timeline">
          <div className="tl-axis">
            {Array.from({ length: cycles }, (_, c) => (
              <div
                key={c}
                className="tl-cycle"
                style={{ left: `${((c === 0 ? 0 : cycleEnd(c - 1)) / end) * 100}%`, width: `${((c === 0 ? 150 : 100) / end) * 100}%` }}
              >
                {c}
              </div>
            ))}
          </div>
          {rows.map(({ key, kind }) => (
            <div key={key} className={`tl-row ${key === "aha" ? "aha" : ""} ${kind}`}>
              <Face id={key} kind={kind} />
              <div className="tl-track">
                {Array.from({ length: cycles - 1 }, (_, c) => (
                  <i key={c} className="tl-line" style={{ left: `${(cycleEnd(c) / end) * 100}%` }} />
                ))}
                {result.turns
                  .filter((e) => e.key === key)
                  .map((e, i) => (
                    <motion.span
                      key={i}
                      className={`tl-dot ${e.ult ? "ult" : ""} ${e.extra ? "extra" : ""}`}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: Math.min(i, 20) * 0.02 }}
                      style={{ left: `${(e.av / end) * 100}%`, background: colorOf(key), color: colorOf(key), rotate: e.ult ? 45 : 0 }}
                      title={`${e.name} · ${e.ult ? "필살기" : actionName(e.action)} · 행동치 ${fmt(e.av)} · ${e.cycle}사이클 · 속도 ${fmt(e.spd)}${e.damage > 0 ? ` · 피해 ${fmtDmg(e.damage)}` : ""}`}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="teamsim-bottom">
        <div className="tool-card">
          <h3>사이클별 행동 횟수</h3>
          <table className="cycle-table">
            <thead>
              <tr>
                <th />
                {Array.from({ length: cycles }, (_, c) => (
                  <th key={c} className="num">
                    {c}
                  </th>
                ))}
                <th>합계</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, kind, name }) => {
                const n = counts(key);
                return (
                  <tr key={key}>
                    <td className="who">
                      <Face id={key} kind={kind} />
                      {key === "aha" ? "아하 타임" : name}
                    </td>
                    {n.map((v, c) => (
                      <td key={c} className={`num n${Math.min(v, 3)}`}>
                        {v}
                      </td>
                    ))}
                    <td className="num total">{n.reduce((a, b) => a + b, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="tool-card">
          <h3>
            행동 순서 <small>0~1사이클</small>
          </h3>
          <ol className="order">
            {result.turns
              .filter((e) => e.av <= cycleEnd(1) + 1e-9)
              .map((e, i) => (
                <li key={i} className={e.cycle === 0 ? "c0" : "c1"} title={`${e.name} · ${e.ult ? "필살기" : actionName(e.action)}`}>
                  <span className="idx num">{i + 1}</span>
                  <Face id={e.key} kind={e.kind} />
                  {e.ult && <span className="ult-tag">필</span>}
                  {e.extra && <span className="ult-tag">보</span>}
                  <span className="av num">{fmt(e.av)}</span>
                </li>
              ))}
          </ol>
        </div>

        <div className="tool-card">
          <h3>
            자주 쓰는 속도 구간 <small>버프 없이</small>
          </h3>
          <ul className="bp-list">
            {BREAKPOINTS.map((b) => (
              <li key={b.label}>
                <span>{b.label}</span>
                <b className="num">{fmt(Math.ceil(b.spd * 10) / 10)}</b>
              </li>
            ))}
          </ul>
          <p className="tool-note">
            행동 당기기·속도 버프·필살기(에너지)·전투 스킬 포인트까지 계산한 결과예요. 환락 캐릭터가 있으면 아하 타임도 계산해요(아하 속도 = 80 + 환락 캐릭터 속도
            1~4위 ÷ 5/10/20/40).
          </p>
        </div>
      </div>
    </>
  );
}

// ---------- Playback ----------

function Playback({ result }: { result: BattleResult }) {
  const turns = result.turns;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    setIdx(0);
    setPlaying(false);
  }, [result]);
  useEffect(() => {
    if (!playing) return;
    if (idx >= turns.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIdx((i) => Math.min(turns.length - 1, i + 1)), 1100 / speed);
    return () => clearTimeout(t);
  }, [playing, idx, speed, turns.length]);

  const ev: TurnEvent | undefined = turns[idx];
  if (!ev?.snap) return null;
  const snap = ev.snap;
  const dmgEnd = turns[idx + 1]?.dmgStart ?? result.damage.length;
  const hits = result.damage.slice(ev.dmgStart, dmgEnd);
  const hitTotal = hits.reduce((a, d) => a + d.amount, 0);
  const sofar = result.damage.slice(0, dmgEnd).reduce((a, d) => a + d.amount, 0);
  const order = snap.units.filter((u) => u.kind !== "enemy" || u.key === "enemy0").sort((a, b) => a.wait - b.wait);
  const party = snap.units.filter((u) => u.kind === "char");
  const enemies = snap.units.filter((u) => u.kind === "enemy");
  const byAction = new Map<string, number>();
  for (const d of hits) byAction.set(`${d.by}|${d.action}`, (byAction.get(`${d.by}|${d.action}`) ?? 0) + d.amount);

  return (
    <div className="playback">
      <div className="tool-card pb-controls">
        <button className="tool-btn small" onClick={() => setIdx(0)} title="처음으로">
          ⏮
        </button>
        <button className="tool-btn small" onClick={() => setIdx((i) => Math.max(0, i - 1))} title="이전 행동">
          ◀
        </button>
        <button className="tool-btn primary small" onClick={() => setPlaying(!playing)}>
          {playing ? "일시정지" : "재생"}
        </button>
        <button className="tool-btn small" onClick={() => setIdx((i) => Math.min(turns.length - 1, i + 1))} title="다음 행동">
          ▶
        </button>
        <div className="tseg mini">
          {[1, 2, 4].map((s) => (
            <button key={s} className={speed === s ? "on" : ""} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
        <input
          className="pb-range"
          type="range"
          min={0}
          max={turns.length - 1}
          value={idx}
          onChange={(e) => {
            setPlaying(false);
            setIdx(Number(e.target.value));
          }}
        />
        <span className="num pb-count">
          {idx + 1} / {turns.length}
        </span>
      </div>

      <div className="tool-card pb-now" style={{ ["--glow" as string]: colorOf(ev.key) + "88" }}>
        <AnimatePresence mode="popLayout">
          <motion.div
            key={idx}
            className="pb-now-in"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25 }}
          >
            <Face id={ev.key} kind={ev.kind} />
            <div className="pb-what">
              <span className="pb-meta num">
                행동치 {fmt(ev.av)} · {ev.cycle}사이클{ev.extra ? " · 보너스 턴" : ""}
              </span>
              <b>
                {ev.name} — {ev.ult ? "필살기" : actionName(ev.action)}
              </b>
              <span className="pb-meta">
                전투 스킬 포인트 <b className="num">{fmt(snap.sp).replace(/\.0$/, "")}</b>
                {result.turns.some((t) => t.key === "aha") && (
                  <>
                    {" · "}웃음 포인트 <b className="num">{Math.round(snap.punch)}</b>
                  </>
                )}
              </span>
            </div>
            <div className="pb-dmg">
              {hitTotal > 0 ? (
                <motion.b className="num" initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  {fmtDmg(hitTotal)}
                </motion.b>
              ) : (
                <span className="tool-note">피해 없음</span>
              )}
              <span className="tool-note num">누적 {fmtDmg(sofar)}</span>
            </div>
          </motion.div>
        </AnimatePresence>
        {byAction.size > 0 && (
          <div className="pb-hits">
            {[...byAction].map(([k, v]) => {
              const [by, action] = k.split("|");
              return (
                <span key={k}>
                  {by} · {actionName(action)} <b className="num">{fmtDmg(v)}</b>
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="tool-card pb-bar">
        <h3>
          행동 순서 <small>다음 차례까지 남은 행동치</small>
        </h3>
        <div className="pb-order">
          {order.map((u) => (
            <motion.div layout key={u.key} className={`pb-unit ${u.wait === 0 ? "now" : ""} ${u.kind}`} style={{ ["--c" as string]: colorOf(u.key) }}>
              <Face id={u.key} kind={u.kind} />
              <span className="num">{u.wait === 0 ? "행동" : fmt(u.wait)}</span>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="pb-grid">
        {party.map((u) => (
          <div
            key={u.key}
            className={`tool-card pb-char ${u.key === ev.key || u.key === ev.owner ? "acting" : ""}`}
            style={{ ["--glow" as string]: colorOf(u.key) + "55" }}
          >
            <div className="pb-char-top">
              <Face id={u.key} kind={u.kind} />
              <div>
                <b>{u.name}</b>
                <span className="num">속도 {fmt(u.spd)}</span>
              </div>
            </div>
            {u.maxEnergy ? (
              <div className="pb-energy" title={`에너지 ${Math.round(u.energy ?? 0)} / ${u.maxEnergy}`}>
                <motion.i animate={{ width: `${Math.min(100, ((u.energy ?? 0) / u.maxEnergy) * 100)}%` }} />
                <span className="num">
                  {Math.round(u.energy ?? 0)}/{u.maxEnergy}
                </span>
              </div>
            ) : null}
            <div className="pb-buffs">
              {u.states.map((s) => (
                <span key={s} className="state">
                  {s}
                </span>
              ))}
              {u.banger !== undefined && <span className="state">훌륭한 솜씨 {Math.round(u.banger)}</span>}
              {u.buffs.slice(0, 8).map((b, i) => (
                <span key={i} title={b.note}>
                  {shortNote(b.note)}
                  {b.left > 0 && <small className="num">{b.left}턴</small>}
                  {b.stacks > 1 && <small className="num">×{b.stacks}</small>}
                </span>
              ))}
              {u.buffs.length > 8 && <span>+{u.buffs.length - 8}</span>}
            </div>
          </div>
        ))}
        <div className="tool-card pb-enemies">
          {enemies.map((u) => (
            <div key={u.key} className="pb-enemy">
              <span className="enemy-face">적</span>
              <div className="pb-tough" title={`강인성 ${Math.round(u.toughness ?? 0)} / ${u.maxToughness}`}>
                <motion.i animate={{ width: `${((u.toughness ?? 0) / (u.maxToughness || 1)) * 100}%` }} />
              </div>
              {u.broken && <span className="broken">격파</span>}
              {(u.buffs.length > 0 || (u.dots ?? 0) > 0) && (
                <span className="tool-note" title={u.buffs.map((b) => b.note).join("\n")}>
                  디버프 {u.buffs.length + (u.dots ?? 0)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** "전투 스킬: 대상이 가하는 피해 증가 (1턴)" → "대상이 가하는 피해 증가" */
function shortNote(note: string) {
  return note.replace(/^[^:]+:\s*/, "").replace(/\s*\([^)]*\)$/, "");
}
