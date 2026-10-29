import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { asset, ELEMENT_COLORS, game } from "../data/game";
import { statTotal } from "../lib/stats";
import {
  BREAKPOINTS,
  cycleEnd,
  nextBreakpoint,
  perCycle,
  simulate,
  type SimUnit,
} from "../lib/teamsim";
import type { Account, OwnedCharacter } from "../types";
import "../styles/tools.css";
import "../styles/teamsim.css";

const TEAM_KEY = "sra.teamsim.team";
const BUFF_KEY = "sra.teamsim.buffs";

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
  const el = game.characters[id]?.element;
  return el ? ELEMENT_COLORS[el] : "#dcbc7c";
};
const fmt = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

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

export function TeamSimPage({ account }: { account: Account }) {
  const chars = account.characters;
  const byId = useMemo(() => new Map(chars.map((c) => [c.id, c])), [chars]);
  const presets = useMemo(() => recentTeams(account, new Set(byId.keys())), [account, byId]);

  const [team, setTeamState] = useState<string[]>(() => {
    const saved = load<string[]>(TEAM_KEY, []).filter((id) => byId.has(id));
    if (saved.length) return saved;
    return presets[0]?.ids ?? chars.slice(0, 4).map((c) => c.id);
  });
  const [buffs, setBuffsState] = useState<Record<string, number>>(() => load(BUFF_KEY, {}));
  const [cycles, setCycles] = useState(5);
  const [picking, setPicking] = useState<number | null>(null);

  const setTeam = (t: string[]) => {
    setTeamState(t);
    save(TEAM_KEY, t);
  };
  const setBuff = (id: string, v: number) => {
    const next = { ...buffs, [id]: v };
    setBuffsState(next);
    save(BUFF_KEY, next);
  };

  const units: SimUnit[] = team
    .map((id) => byId.get(id))
    .filter((c): c is OwnedCharacter => !!c)
    .map((c) => ({ key: c.id, spd: statTotal(c, "SPD") + (buffs[c.id] ?? 0) }));
  const actions = useMemo(() => simulate(units, cycles), [JSON.stringify(units), cycles]);
  const end = cycleEnd(cycles - 1);

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
        {presets.length > 0 && (
          <div className="presets">
            <span className="tool-note">최근 엔드 컨텐츠 파티</span>
            {presets.map((p) => (
              <button key={p.label} className="tool-btn small" onClick={() => setTeam(p.ids)}>
                {p.label}
              </button>
            ))}
          </div>
        )}
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
          const id = team[i];
          const c = id ? byId.get(id) : undefined;
          const base = c ? statTotal(c, "SPD") : 0;
          const bp = c ? nextBreakpoint(base + (buffs[c.id] ?? 0), cycles) : null;
          const total = c ? actions.filter((a) => a.key === c.id).length : 0;
          return (
            <div key={i} className={`ts-slot tool-card ${c ? "" : "empty"}`} style={{ ["--glow" as string]: c ? colorOf(c.id) + "66" : undefined }}>
              <button className="ts-face" onClick={() => setPicking(picking === i ? null : i)} title="캐릭터 바꾸기">
                {c ? <img src={icon(c.id)} alt="" /> : <span>+</span>}
              </button>
              {c ? (
                <div className="ts-info">
                  <div className="ts-name">
                    <b>{nameOf(c.id)}</b>
                    <button className="ts-x" onClick={() => setTeam(team.filter((_, j) => j !== i))} title="빼기">
                      ×
                    </button>
                  </div>
                  <div className="ts-spd">
                    <span>속도</span>
                    <b className="num">{fmt(base + (buffs[c.id] ?? 0))}</b>
                    <label>
                      +
                      <input
                        className="num-input"
                        type="number"
                        step={1}
                        value={buffs[c.id] ?? 0}
                        onChange={(e) => setBuff(c.id, Number(e.target.value) || 0)}
                        title="버프·당기기 효과를 속도로 더해 보세요"
                      />
                    </label>
                  </div>
                  <div className="ts-foot">
                    {cycles}사이클 <b className="num">{total}</b>회 행동
                    {bp && (
                      <span className="bp">
                        속도 <b className="num">+{fmt(Math.max(0.1, bp.spd - base - (buffs[c.id] ?? 0)))}</b> → {bp.cycle}사이클까지 {bp.actions}회
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="ts-info tool-note">캐릭터를 골라 주세요</div>
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
              행동 타임라인 <small>첫 사이클 150 · 이후 사이클마다 100 행동치</small>
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
              {units.map((u) => (
                <div key={u.key} className="tl-row">
                  <img src={icon(u.key)} alt="" />
                  <div className="tl-track">
                    {Array.from({ length: cycles - 1 }, (_, c) => (
                      <i key={c} className="tl-line" style={{ left: `${(cycleEnd(c) / end) * 100}%` }} />
                    ))}
                    {actions
                      .filter((a) => a.key === u.key)
                      .map((a) => (
                        <motion.span
                          key={a.n}
                          className="tl-dot"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: a.n * 0.02 }}
                          style={{ left: `${(a.av / end) * 100}%`, background: colorOf(u.key), color: colorOf(u.key) }}
                          title={`${a.n}번째 행동 · 행동치 ${fmt(a.av)} · ${a.cycle}사이클`}
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
                  {units.map((u) => {
                    const counts = perCycle(actions, u.key, cycles);
                    return (
                      <tr key={u.key}>
                        <td className="who">
                          <img src={icon(u.key)} alt="" />
                          {nameOf(u.key)}
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
                {actions
                  .filter((a) => a.av <= cycleEnd(1))
                  .map((a, i) => (
                    <li key={`${a.key}-${a.n}`} className={a.cycle === 0 ? "c0" : "c1"}>
                      <span className="idx num">{i + 1}</span>
                      <img src={icon(a.key)} alt="" />
                      <span className="av num">{fmt(a.av)}</span>
                    </li>
                  ))}
              </ol>
            </div>

            <div className="tool-card">
              <h3>자주 쓰는 속도 구간</h3>
              <ul className="bp-list">
                {BREAKPOINTS.map((b) => (
                  <li key={b.label}>
                    <span>{b.label}</span>
                    <b className="num">{fmt(Math.ceil(b.spd * 10) / 10)}</b>
                  </li>
                ))}
              </ul>
              <p className="tool-note">
                속도는 HoYoLAB에 표시된 최종 속도예요. 행동 당기기나 속도 버프 같은 캐릭터 효과는 계산에 들어가지 않으니, 캐릭터마다 + 칸에 속도로 더해서 확인해 보세요.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
