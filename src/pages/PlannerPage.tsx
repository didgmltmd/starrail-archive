import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { asset, game } from "../data/game";
import {
  canPlan,
  compute,
  CREDIT_ID,
  currentLevel,
  currentPlan,
  errorText,
  LEVEL_STEPS,
  loadAvatars,
  loadDetail,
  maxPlan,
  summarize,
  type CalcAvatar,
  type CalcDetail,
  type CalcResult,
  type CalcSkill,
  type Plan,
} from "../lib/planner";
import "../styles/tools.css";
import "../styles/planner.css";

const SKILL_NAMES: Record<string, string> = { "001": "일반 공격", "002": "전투 스킬", "003": "필살기", "004": "특성" };

const avatarIcon = (a: CalcAvatar) => {
  const p = game.characters[a.item_id]?.icon;
  return p ? asset(p) : a.icon_url;
};

export function PlannerPage({ linked, onLink }: { linked: boolean; onLink: () => void }) {
  const [avatars, setAvatars] = useState<CalcAvatar[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const loadList = () => {
    setListError(null);
    loadAvatars()
      .then((list) => {
        setAvatars(list);
        setSelected((s) => s ?? list[0]?.item_id ?? null);
      })
      .catch((e) => setListError(errorText(e)));
  };
  useEffect(() => {
    if (canPlan && linked) loadList();
  }, [linked]);

  if (!linked || !canPlan) {
    return (
      <div className="page tool-page">
        <div className="tool-empty">
          <h2>HoYoLAB 연동이 필요해요</h2>
          육성 계산은 HoYoLAB 공식 계산기로 하고, 가방에 있는 재료 수량도 함께 확인해요.
          <br />
          <button className="tool-btn primary" onClick={onLink}>
            HoYoLAB 연동하기
          </button>
        </div>
      </div>
    );
  }

  const shown = (avatars ?? []).filter((a) => !query || a.item_name.includes(query.trim()));

  return (
    <div className="page tool-page planner-page">
      <aside className="planner-list">
        <input className="planner-search" placeholder="캐릭터 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        {listError && (
          <div className="tool-note error-text">
            {listError}
            <button className="tool-btn small" onClick={loadList}>
              다시 시도
            </button>
          </div>
        )}
        {!avatars && !listError && <div className="tool-note">불러오는 중</div>}
        <div className="planner-avatars">
          {shown.map((a) => (
            <button
              key={a.item_id}
              className={`planner-avatar r${a.rarity} ${selected === a.item_id ? "on" : ""}`}
              onClick={() => setSelected(a.item_id)}
              title={a.item_name}
            >
              <img src={avatarIcon(a)} alt="" loading="lazy" />
              <span className="name">{a.item_name}</span>
              <span className="lv num">Lv.{a.cur_level}</span>
            </button>
          ))}
        </div>
      </aside>
      {selected && <PlannerDetail key={selected} id={selected} avatar={avatars?.find((a) => a.item_id === selected)} />}
    </div>
  );
}

function PlannerDetail({ id, avatar }: { id: string; avatar?: CalcAvatar }) {
  const [detail, setDetail] = useState<CalcDetail | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  useEffect(() => {
    loadDetail(id)
      .then((d) => {
        setDetail(d);
        setPlan(maxPlan(d));
      })
      .catch((e) => setError(errorText(e)));
  }, [id]);

  // Recalculate shortly after the last change
  useEffect(() => {
    if (!detail || !plan) return;
    let alive = true;
    const t = setTimeout(() => {
      setComputing(true);
      compute(detail, plan)
        .then((r) => {
          if (!alive) return;
          setResult(r);
          setCalcError(null);
        })
        .catch((e) => alive && setCalcError(errorText(e)))
        .finally(() => alive && setComputing(false));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [detail, plan]);

  const lines = useMemo(() => (result ? summarize(result) : []), [result]);

  if (error) return <div className="planner-main tool-note error-text">{error}</div>;
  if (!detail || !plan) return <div className="planner-main tool-note">불러오는 중</div>;

  const a = detail.avatar;
  const mainSkills = [...detail.skills, ...(detail.skills_servant ?? []), ...(detail.skills_special ?? [])].filter((s) => s.max_level > 1);
  const traces = [...detail.skills_other, ...detail.skills.filter((s) => s.max_level === 1)].filter((s) => s.point_type !== 2);
  const learned = traces.filter((t) => currentLevel(t) === 1).length;
  const planned = traces.filter((t) => (plan.skills[t.point_id] ?? 0) >= 1).length;
  const setSkill = (pid: string, v: number) => setPlan({ ...plan, skills: { ...plan.skills, [pid]: v } });
  const credits = lines.find((l) => l.item.item_id === CREDIT_ID);
  const mats = lines.filter((l) => l.item.item_id !== CREDIT_ID);
  const missing = mats.filter((l) => l.missing > 0);
  const nothing = result && lines.length === 0;

  return (
    <div className="planner-main">
      <div className="tool-card planner-head" style={{ ["--glow" as string]: "rgba(240,190,110,0.4)" }}>
        <img className="face" src={avatar ? avatarIcon(avatar) : a.icon_url} alt="" />
        <div className="who">
          <b>{a.item_name}</b>
          <span className="num">
            Lv.{a.cur_level} · 행적 {learned}/{traces.length}
          </span>
        </div>
        <div className="planner-presets">
          <button className="tool-btn small" onClick={() => setPlan(maxPlan(detail))}>
            전부 최대
          </button>
          <button className="tool-btn small" onClick={() => setPlan(currentPlan(detail))}>
            현재 상태로
          </button>
        </div>
      </div>

      <div className="planner-body">
        <div className="tool-card planner-targets">
          <h3>목표</h3>
          <Target
            label="캐릭터 레벨"
            cur={a.cur_level}
            value={plan.level}
            options={LEVEL_STEPS.filter((l) => l >= a.cur_level && l <= a.max_level)}
            onChange={(v) => setPlan({ ...plan, level: v })}
          />
          {detail.equipment && (
            <Target
              label={detail.equipment.item_name}
              icon={detail.equipment.item_url}
              cur={detail.equipment.cur_level}
              value={plan.lightCone}
              options={LEVEL_STEPS.filter((l) => l >= detail.equipment!.cur_level && l <= detail.equipment!.max_level)}
              onChange={(v) => setPlan({ ...plan, lightCone: v })}
            />
          )}
          <div className="planner-skills">
            {mainSkills.map((s) => (
              <SkillStepper
                key={s.point_id}
                skill={s}
                label={SKILL_NAMES[s.point_id.slice(-3)] ?? (detail.skills_servant?.includes(s) ? "기억 정령" : "추가 스킬")}
                value={plan.skills[s.point_id] ?? currentLevel(s)}
                onChange={(v) => setSkill(s.point_id, v)}
              />
            ))}
          </div>
          <div className="planner-traces">
            <div className="traces-head">
              <span>
                행적 <b className="num">{planned}</b>
                <small className="num"> / {traces.length}</small>
              </span>
              <button
                className="tool-btn small"
                onClick={() => {
                  const all = planned < traces.length;
                  const skills = { ...plan.skills };
                  for (const t of traces) skills[t.point_id] = all ? 1 : currentLevel(t);
                  setPlan({ ...plan, skills });
                }}
              >
                {planned < traces.length ? "전부 해금" : "현재 상태로"}
              </button>
            </div>
            <div className="trace-grid">
              {traces.map((t) => {
                const have = currentLevel(t) === 1;
                const on = (plan.skills[t.point_id] ?? 0) >= 1;
                return (
                  <button
                    key={t.point_id}
                    className={`trace ${have ? "have" : on ? "on" : ""} ${t.point_type === 3 ? "major" : ""}`}
                    disabled={have}
                    onClick={() => setSkill(t.point_id, on ? 0 : 1)}
                    title={have ? "이미 해금" : on ? "해금 예정 (누르면 제외)" : "누르면 해금 예정"}
                  >
                    <img src={t.item_url} alt="" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="tool-card planner-result">
          <h3>
            필요한 재료
            <small>{computing ? "계산 중" : "HoYoLAB 공식 계산기 · 보유 수량은 가방 기준"}</small>
          </h3>
          {calcError && <p className="tool-note error-text">{calcError}</p>}
          {nothing && <p className="tool-note">목표가 현재 상태와 같아요.</p>}
          {result && !nothing && (
            <>
              <div className={`planner-verdict ${missing.length ? "short" : "ok"}`}>
                {missing.length ? (
                  <>
                    <b className="num">{missing.length}</b>종이 부족해요
                  </>
                ) : (
                  <>지금 가진 재료로 전부 올릴 수 있어요</>
                )}
                {credits && (
                  <span className="credits">
                    신용 포인트 <b className="num">{credits.need.toLocaleString()}</b>
                    {credits.missing > 0 && <em className="num"> (−{credits.missing.toLocaleString()})</em>}
                  </span>
                )}
              </div>
                <div className="mat-grid">
                  {mats.map((l) => (
                    <motion.div
                      key={l.item.item_id}
                      layout
                      className={`mat r${l.item.rarity} ${l.missing > 0 ? "missing" : l.craftable > 0 ? "craft" : "ok"}`}
                      title={l.item.item_name}
                    >
                      <div className="mat-icon">
                        <img src={l.item.item_url} alt="" loading="lazy" />
                      </div>
                      <div className="mat-name">{l.item.item_name}</div>
                      <div className="mat-nums num">
                        <b>{l.need.toLocaleString()}</b>
                        <span>보유 {l.owned.toLocaleString()}</span>
                      </div>
                      <div className="mat-state">
                        {l.missing > 0 ? `${l.missing.toLocaleString()} 부족` : l.craftable > 0 ? "합성하면 충분" : "충분"}
                      </div>
                    </motion.div>
                  ))}
                </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Target({
  label,
  icon,
  cur,
  value,
  options,
  onChange,
}: {
  label: string;
  icon?: string;
  cur: number;
  value: number;
  options: number[];
  onChange: (v: number) => void;
}) {
  const opts = [...new Set([cur, ...options])].sort((x, y) => x - y);
  return (
    <div className="target">
      {icon && <img src={icon} alt="" />}
      <span className="target-label">{label}</span>
      <span className="num target-cur">Lv.{cur}</span>
      <span className="arrow">→</span>
      <div className="tseg">
        {opts.map((o) => (
          <button key={o} className={o === value ? "on" : ""} onClick={() => onChange(o)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function SkillStepper({ skill, label, value, onChange }: { skill: CalcSkill; label: string; value: number; onChange: (v: number) => void }) {
  const cur = currentLevel(skill);
  return (
    <div className="skill">
      <img src={skill.item_url} alt="" />
      <span className="skill-label">{label}</span>
      <span className="num skill-cur">{cur}</span>
      <span className="arrow">→</span>
      <button className="step" disabled={value <= cur} onClick={() => onChange(value - 1)}>
        −
      </button>
      <b className="num skill-val">{value}</b>
      <button className="step" disabled={value >= skill.max_level} onClick={() => onChange(value + 1)}>
        +
      </button>
      <span className="num skill-max">/ {skill.max_level}</span>
    </div>
  );
}

