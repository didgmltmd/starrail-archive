import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { asset, ELEMENT_COLORS, game } from "../data/game";
import { statTotal } from "../lib/stats";
import {
  AHA,
  availableEffects,
  baseSpd,
  BREAKPOINTS,
  cycleEnd,
  nextBreakpoint,
  perCycle,
  simulate,
  ultEstimate,
  type Applied,
  type SimEvent,
  type UnitSetup,
} from "../lib/teamsim";
import type { Account, OwnedCharacter } from "../types";
import "../styles/tools.css";
import "../styles/teamsim.css";

const TEAM_KEY = "sra.teamsim.team";
const CFG_KEY = "sra.teamsim.cfg";
const OLD_BUFF_KEY = "sra.teamsim.buffs";

/** Per-character choices, remembered between visits. */
interface UnitCfg {
  /** Manual SPD bonus */
  extra: number;
  /** Skill every N turns (0 = never) */
  skillEvery: number;
  /** Ultimate every N turns, 0 = never, null = estimate from energy */
  ult: number | null;
  /** Single-target effects go to this character */
  target?: string;
  /** Effects turned off by the user */
  off: string[];
}

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
const nameOf = (id: string) => (id === AHA ? "아하" : game.characters[id]?.name ?? id);
const colorOf = (id: string) => {
  if (id === AHA) return "#ef7fb4";
  const el = game.characters[id]?.element;
  return el ? ELEMENT_COLORS[el] : "#dcbc7c";
};
const fmt = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
/** Character portrait, or a badge for Aha (no portrait in the game data) */
const Face = ({ id }: { id: string }) => (id === AHA ? <span className="aha-face">아하</span> : <img src={icon(id)} alt="" />);
const dotTitle = (e: SimEvent) =>
  e.key === AHA
    ? `아하 타임${e.extra ? " (보너스 턴)" : ""} · 행동치 ${fmt(e.av)} · ${e.cycle}사이클 · 아하 속도 ${fmt(e.spd)}`
    : `${e.n}번째 행동 · 행동치 ${fmt(e.av)} · ${e.cycle}사이클 · ${e.type === "skill" ? "전투 스킬" : "일반 공격"}${e.ult ? " + 필살기" : ""} · 속도 ${fmt(e.spd)}`;

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

const hasAllyEffect = (list: Applied[]) => list.some((a) => a.effect.to === "ally");

export function TeamSimPage({ account }: { account: Account }) {
  const chars = account.characters;
  const byId = useMemo(() => new Map(chars.map((c) => [c.id, c])), [chars]);
  const presets = useMemo(() => recentTeams(account, new Set(byId.keys())), [account, byId]);

  const [team, setTeamState] = useState<string[]>(() => {
    const saved = load<string[]>(TEAM_KEY, []).filter((id) => byId.has(id));
    if (saved.length) return saved;
    return presets[0]?.ids ?? chars.slice(0, 4).map((c) => c.id);
  });
  const [cfgs, setCfgs] = useState<Record<string, Partial<UnitCfg>>>(() => {
    const cfg = load<Record<string, Partial<UnitCfg>>>(CFG_KEY, {});
    // Older versions kept only the manual SPD bonus
    for (const [id, extra] of Object.entries(load<Record<string, number>>(OLD_BUFF_KEY, {}))) {
      cfg[id] = { extra, ...cfg[id] };
    }
    return cfg;
  });
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

  const members = team.map((id) => byId.get(id)).filter((c): c is OwnedCharacter => !!c);

  // Everything the simulator needs, per member
  const setups = useMemo(() => {
    return members.map((c, i) => {
      const cfg = cfgs[c.id] ?? {};
      const final = statTotal(c, "SPD");
      const all = availableEffects(c, final);
      const skillEvery = cfg.skillEvery ?? 1;
      const est = ultEstimate(c, skillEvery);
      const ult = cfg.ult === undefined ? null : cfg.ult;
      const others = members.filter((m) => m.id !== c.id).map((m) => m.id);
      const target = cfg.target && others.includes(cfg.target) ? cfg.target : others[0];
      const setup: UnitSetup = {
        key: c.id,
        path: game.characters[c.id]?.path ?? "",
        base: baseSpd(c),
        spd: final + (cfg.extra ?? 0),
        skillEvery,
        ultFirst: ult === null ? est.first : ult,
        ultEvery: ult === null ? est.every : ult,
        target,
        effects: all.filter((a) => !(cfg.off ?? []).includes(a.id)),
      };
      return { c, i, final, all, est, ult, cfg, setup };
    });
  }, [JSON.stringify(team), cfgs, chars]);

  const units = setups.map((s) => s.setup);
  const events = useMemo(() => simulate(units, cycles), [JSON.stringify(units), cycles]);
  const breakpoints = useMemo(
    () => Object.fromEntries(units.map((u) => [u.key, nextBreakpoint(units, u.key, cycles)])),
    [JSON.stringify(units), cycles],
  );
  const end = cycleEnd(cycles - 1);
  // Timeline rows: party members, then Aha when Elation characters bring it in
  const rows = [...units.map((u) => u.key), ...(events.some((e) => e.key === AHA) ? [AHA] : [])];

  if (!chars.length) {
    return (
      <div className="page tool-page">
        <div className="tool-empty">
          <h2>캐릭터가 없어요</h2>
          HoYoLAB을 연동하면 보유 캐릭터의 실제 속도로 계산해요.
        </div>
      </div>
    );
  }

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
          {[3, 5, 10].map((n) => (
            <button key={n} className={cycles === n ? "on" : ""} onClick={() => setCycles(n)}>
              {n}사이클
            </button>
          ))}
        </div>
      </div>

      <div className="ts-slots">
        {[0, 1, 2, 3].map((i) => {
          const s = setups[i];
          const c = s?.c;
          const total = c ? events.filter((e) => e.key === c.id).length : 0;
          const bp = c ? breakpoints[c.id] : null;
          const others = setups.filter((o) => o.c.id !== c?.id);
          return (
            <div key={i} className={`ts-slot tool-card ${c ? "" : "empty"}`} style={{ ["--glow" as string]: c ? colorOf(c.id) + "66" : undefined }}>
              <div className="ts-main">
                <button className="ts-face" onClick={() => setPicking(picking === i ? null : i)} title="캐릭터 바꾸기">
                  {c ? <img src={icon(c.id)} alt="" /> : <span>+</span>}
                </button>
                {c && s ? (
                  <div className="ts-info">
                    <div className="ts-name">
                      <b>
                        {nameOf(c.id)} <small className="num">{c.eidolon}돌</small>
                      </b>
                      <button className="ts-x" onClick={() => setTeam(team.filter((x) => x !== c.id))} title="빼기">
                        ×
                      </button>
                    </div>
                    <div className="ts-spd">
                      <span>속도</span>
                      <b className="num">{fmt(s.setup.spd)}</b>
                      <label title="계산에 없는 버프를 속도로 더해 보세요">
                        +
                        <input
                          className="num-input"
                          type="number"
                          step={1}
                          value={s.cfg.extra ?? 0}
                          onChange={(e) => setCfg(c.id, { extra: Number(e.target.value) || 0 })}
                        />
                      </label>
                    </div>
                    <div className="ts-foot">
                      {cycles}사이클 <b className="num">{total}</b>회 행동
                      {bp && (
                        <span className="bp">
                          속도 <b className="num">+{fmt(bp.extra)}</b> → {bp.actions}회
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="ts-info tool-note">캐릭터를 골라 주세요</div>
                )}
              </div>

              {c && s && (
                <div className="ts-cfg">
                  <label>
                    전투 스킬
                    <select value={s.setup.skillEvery} onChange={(e) => setCfg(c.id, { skillEvery: Number(e.target.value) })}>
                      <option value={1}>매 턴</option>
                      <option value={2}>2턴마다</option>
                      <option value={3}>3턴마다</option>
                      <option value={0}>안 씀</option>
                    </select>
                  </label>
                  <label>
                    필살기
                    <select
                      value={s.ult === null ? "auto" : String(s.ult)}
                      onChange={(e) => setCfg(c.id, { ult: e.target.value === "auto" ? null : Number(e.target.value) })}
                    >
                      <option value="auto">
                        자동 ({s.est.first}턴째, 이후 {s.est.every}턴마다)
                      </option>
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}턴마다
                        </option>
                      ))}
                      <option value="0">안 씀</option>
                    </select>
                  </label>
                  {hasAllyEffect(s.all) && others.length > 0 && (
                    <label>
                      대상
                      <select value={s.setup.target} onChange={(e) => setCfg(c.id, { target: e.target.value })}>
                        {others.map((o) => (
                          <option key={o.c.id} value={o.c.id}>
                            {nameOf(o.c.id)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <ul className="ts-effects">
                    {s.all.length === 0 && <li className="none">속도 관련 효과 없음 · 속도만 계산</li>}
                    {s.all.map((a) => {
                      const on = !(s.cfg.off ?? []).includes(a.id);
                      return (
                        <li key={a.id}>
                          <button
                            className={on ? "on" : ""}
                            onClick={() =>
                              setCfg(c.id, { off: on ? [...(s.cfg.off ?? []), a.id] : (s.cfg.off ?? []).filter((x) => x !== a.id) })
                            }
                            title={on ? "누르면 빼고 계산" : "누르면 넣고 계산"}
                          >
                            <i>{on ? "✓" : ""}</i>
                            {a.effect.note}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <AnimatePresence>
                {picking === i && (
                  <motion.div
                    className="picker"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {[...chars]
                      .sort((a, b) => statTotal(b, "SPD") - statTotal(a, "SPD"))
                      .map((o) => (
                        <button
                          key={o.id}
                          className={team.includes(o.id) ? "in" : ""}
                          onClick={() => {
                            // Swap when the character already sits in another slot
                            const next = [...team];
                            const from = next.indexOf(o.id);
                            if (i < next.length) {
                              if (from >= 0) next[from] = next[i];
                              next[i] = o.id;
                            } else {
                              if (from >= 0) next.splice(from, 1);
                              next.push(o.id);
                            }
                            setTeam(next.slice(0, 4));
                            setPicking(null);
                          }}
                        >
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
        })}
      </div>

      {units.length > 0 && (
        <>
          <div className="tool-card timeline-card">
            <h3>
              행동 타임라인 <small>첫 사이클 150 · 이후 사이클마다 100 행동치 · ◆ 필살기{rows.includes(AHA) ? " · ○ 아하 보너스 턴" : ""}</small>
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
              {rows.map((key) => (
                <div key={key} className={`tl-row ${key === AHA ? "aha" : ""}`}>
                  <Face id={key} />
                  <div className="tl-track">
                    {Array.from({ length: cycles - 1 }, (_, c) => (
                      <i key={c} className="tl-line" style={{ left: `${(cycleEnd(c) / end) * 100}%` }} />
                    ))}
                    {events
                      .filter((e) => e.key === key)
                      .map((e) => (
                        <motion.span
                          key={e.n}
                          className={`tl-dot ${e.ult ? "ult" : ""} ${e.extra ? "extra" : ""}`}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: Math.min(e.n, 20) * 0.02 }}
                          style={{ left: `${(e.av / end) * 100}%`, background: colorOf(key), color: colorOf(key), rotate: e.ult ? 45 : 0 }}
                          title={dotTitle(e)}
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
                  {rows.map((key) => {
                    const counts = perCycle(events, key, cycles);
                    return (
                      <tr key={key}>
                        <td className="who">
                          <Face id={key} />
                          {key === AHA ? "아하 타임" : nameOf(key)}
                        </td>
                        {counts.map((n, c) => (
                          <td key={c} className={`num n${Math.min(n, 3)}`}>
                            {n}
                          </td>
                        ))}
                        <td className="num total">{counts.reduce((a, b) => a + b, 0)}</td>
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
                {events
                  .filter((e) => e.av <= cycleEnd(1) + 1e-9)
                  .map((e, i) => (
                    <li key={`${e.key}-${e.n}`} className={e.cycle === 0 ? "c0" : "c1"}>
                      <span className="idx num">{i + 1}</span>
                      <Face id={e.key} />
                      {e.ult && <span className="ult-tag">필</span>}
                      {e.extra && <span className="ult-tag">보</span>}
                      <span className="av num">{fmt(e.av)}</span>
                    </li>
                  ))}
              </ol>
            </div>

            <div className="tool-card">
              <h3>자주 쓰는 속도 구간 <small>버프 없이</small></h3>
              <ul className="bp-list">
                {BREAKPOINTS.map((b) => (
                  <li key={b.label}>
                    <span>{b.label}</span>
                    <b className="num">{fmt(Math.ceil(b.spd * 10) / 10)}</b>
                  </li>
                ))}
              </ul>
              <p className="tool-note">
                캐릭터 효과는 게임 설명의 수치(스킬 10레벨, 행적 해금, 성혼·광추·성유물 세트 기준)로 계산해요. 필살기 시점은 에너지로 추정한 값이라, 실제와 다르면 캐릭터별로 바꿔 주세요.
                환락 캐릭터가 있으면 아하 타임도 계산해요(아하 속도 = 80 + 환락 캐릭터 속도 1~4위 ÷ 5/10/20/40).
                소환물·기억 정령의 행동과 적 처치·격파 같은 조건부 효과는 빠져 있어요.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
