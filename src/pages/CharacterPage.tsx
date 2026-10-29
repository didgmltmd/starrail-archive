import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useMemo, useState } from "react";
import { IconStar } from "../components/icons";
import { asset, formatStat, game, SLOT_NAMES, SLOT_ORDER, STATS } from "../data/game";
import { auditCharacter, statName } from "../lib/audit";
import { computeStats } from "../lib/stats";
import { GradeBadge } from "./AuditPage";
import type { OwnedCharacter, Relic, RelicSlot } from "../types";
import "../styles/character.css";

type SubTab = "stats" | "lightcone" | "relics";

export function Stars({ n }: { n: number }) {
  return (
    <div className="stars-row">
      {Array.from({ length: n }, (_, i) => (
        <IconStar key={i} />
      ))}
    </div>
  );
}

function LoadedImg({ src, className, alt = "" }: { src: string; className?: string; alt?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      className={`fade-img ${loaded ? "loaded" : ""} ${className ?? ""}`}
      onLoad={() => setLoaded(true)}
      draggable={false}
    />
  );
}

export function CharacterPage({ character }: { character: OwnedCharacter }) {
  const [tab, setTab] = useState<SubTab>("stats");
  const info = game.characters[character.id];

  // Mouse parallax for the illustration
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 20 });
  const sy = useSpring(my, { stiffness: 60, damping: 20 });
  const artX = useTransform(sx, (v) => v * -18);
  const artY = useTransform(sy, (v) => v * -12);
  const ringX = useTransform(sx, (v) => v * 10);

  return (
    <div
      className="page character-page"
      onMouseMove={(e) => {
        mx.set(e.clientX / window.innerWidth - 0.5);
        my.set(e.clientY / window.innerHeight - 0.5);
      }}
    >
      <motion.div className="splash-ring" style={{ x: ringX }} />

      <AnimatePresence mode="popLayout">
        <motion.div
          key={character.id}
          className="splash"
          initial={{ opacity: 0, x: -60, scale: 1.04 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 60 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div className="splash-inner" style={{ x: artX, y: artY }}>
            <LoadedImg src={asset(info.portrait)} alt={info.name} />
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence mode="popLayout">
        <motion.div
          key={character.id}
          className="name-plate"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.4, delay: 0.12 } }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
        >
          <div className="name-plate-tags">
            <img src={asset(game.elements[info.element].icon)} alt="" />
            <span>{game.elements[info.element].name}</span>
            <i />
            <img src={asset(game.paths[info.path].icon)} alt="" />
            <span>{game.paths[info.path].name}</span>
          </div>
          <h2>{info.name}</h2>
          <Stars n={info.rarity} />
        </motion.div>
      </AnimatePresence>

      <aside className="detail-panel">
        <div className="detail-head">
          <div className="level">
            <span className="lv-label">Lv.</span>
            <span className="num lv-value">{character.level}</span>
            <span className="num lv-max">/80</span>
          </div>
          <Eidolons n={character.eidolon} />
        </div>

        <div className="seg">
          {(
            [
              ["stats", "속성"],
              ["lightcone", "광추"],
              ["relics", "성유물"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        <div className="detail-body">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab + character.id}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {tab === "stats" && <StatsView character={character} />}
              {tab === "lightcone" && <LightConeView character={character} />}
              {tab === "relics" && <RelicsView character={character} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </aside>
    </div>
  );
}

function Eidolons({ n }: { n: number }) {
  return (
    <div className="eidolons" title={`성혼 ${n}`}>
      <span className="eidolon-label">성혼</span>
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className={`eidolon-dot ${i < n ? "on" : ""}`} />
      ))}
    </div>
  );
}

const ALWAYS = new Set(["HP", "ATK", "DEF", "SPD", "CR", "CD", "BE", "ERR"]);

function StatsView({ character }: { character: OwnedCharacter }) {
  const lines = useMemo(() => computeStats(character), [character]);
  return (
    <div className="stat-list">
      {lines
        .filter((l) => ALWAYS.has(l.key) || l.base + l.bonus > 0)
        .map((l) => {
          const def = STATS[l.key];
          const split = !def.percent;
          return (
            <div key={l.key} className="stat-row">
              <img src={asset(def.icon)} alt="" />
              <span className="stat-name">{def.name}</span>
              <span className="stat-val num">
                {split ? (
                  <>
                    {formatStat(l.key, l.base + l.bonus, 1)}
                    {l.bonus > 0 && (
                      <small>
                        {formatStat(l.key, l.base, 1)} <em>+{formatStat(l.key, l.bonus, 1)}</em>
                      </small>
                    )}
                  </>
                ) : (
                  formatStat(l.key, l.base + l.bonus, 1)
                )}
              </span>
            </div>
          );
        })}
      <p className="hint">행적 보너스는 HoYoLAB 연동 후 반영돼요.</p>
    </div>
  );
}

function LightConeView({ character }: { character: OwnedCharacter }) {
  const lc = character.lightCone;
  if (!lc) return <div className="empty">장착한 광추가 없어요</div>;
  const info = game.lightCones[lc.id];
  const pathMatch = info.path === game.characters[character.id].path;
  return (
    <div className="lc-view">
      <div className={`lc-card r${info.rarity}`}>
        <LoadedImg src={asset(info.portrait)} alt={info.name} />
      </div>
      <div className="lc-info">
        <div className="lc-name">{info.name}</div>
        <Stars n={info.rarity} />
        <div className="lc-meta">
          <span className="chip num">Lv. {lc.level}/80</span>
          <span className="chip gold">중첩 {lc.superimposition}</span>
          <span className="chip">
            <img src={asset(game.paths[info.path].icon)} alt="" />
            {game.paths[info.path].name}
          </span>
        </div>
        {!pathMatch && <div className="warn">운명의 길이 달라 광추 효과가 발동하지 않아요</div>}
        <div className="lc-stats">
          {(["hp", "atk", "def"] as const).map((k) => (
            <div key={k}>
              <img src={asset(STATS[k === "hp" ? "HP" : k === "atk" ? "ATK" : "DEF"].icon)} alt="" />
              <span>{k === "hp" ? "HP" : k === "atk" ? "공격력" : "방어력"}</span>
              <b className="num">{Math.floor(info.base?.[k] ?? 0)}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RelicsView({ character }: { character: OwnedCharacter }) {
  const [slot, setSlot] = useState<RelicSlot>("BODY");
  const bySlot = Object.fromEntries(character.relics.map((r) => [r.slot, r])) as Partial<Record<RelicSlot, Relic>>;
  const selected = bySlot[slot];

  const setCounts = new Map<string, number>();
  for (const r of character.relics) setCounts.set(r.setId, (setCounts.get(r.setId) ?? 0) + 1);

  const audit = useMemo(() => auditCharacter(character), [character]);
  const selectedScore = audit.slots[slot].score;

  return (
    <div className="relic-view">
      <div className="relic-overall">
        <GradeBadge grade={audit.grade} />
        <span>
          세팅 점수 <b className="num">{audit.pct.toFixed(0)}</b>
        </span>
        <span className="grow" />
        <span>{audit.issues.filter((i) => i.severity === "high").length ? `중요 개선 ${audit.issues.filter((i) => i.severity === "high").length}건` : "큰 문제 없음"}</span>
      </div>
      <div className="relic-grid">
        {SLOT_ORDER.map((s) => {
          const r = bySlot[s];
          const sc = audit.slots[s].score;
          return (
            <button key={s} className={`relic-slot ${slot === s ? "on" : ""} ${r ? "" : "empty"}`} onClick={() => setSlot(s)}>
              <div className={`relic-icon r${r?.rarity ?? 0} ${sc?.mainOk === false ? "bad-main" : ""}`}>
                {r && <img src={asset(game.relicSets[r.setId].pieces[s] ?? "")} alt="" />}
                {r && <span className="num relic-lv">+{r.level}</span>}
                {sc && (
                  <span className="relic-grade">
                    <GradeBadge grade={sc.grade} size="sm" />
                  </span>
                )}
              </div>
              <div className="relic-main">
                {r ? (
                  <>
                    <img src={asset(STATS[r.main.key].icon)} alt="" />
                    <span className="num">{formatStat(r.main.key, r.main.value)}</span>
                  </>
                ) : (
                  <span className="dim">{SLOT_NAMES[s]}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="relic-detail">
          <div className="relic-detail-head">
            <span className="slot-name">{SLOT_NAMES[selected.slot]}</span>
            <span className="set-name">{game.relicSets[selected.setId].name}</span>
          </div>
          <div className="relic-main-line">
            <img src={asset(STATS[selected.main.key].icon)} alt="" />
            <span>{STATS[selected.main.key].name}</span>
            {selectedScore?.mainOk === true && <span className="main-flag ok">추천 주옵션</span>}
            {selectedScore?.mainOk === false && (
              <span className="main-flag bad">추천: {audit.slots[slot].recommended.slice(0, 2).map(statName).join(" / ")}</span>
            )}
            <b className="num">{formatStat(selected.main.key, selected.main.value)}</b>
          </div>
          {selected.subs.map((s) => {
            const w = selectedScore?.subs.find((x) => x.key === s.key)?.weight ?? 0;
            return (
            <div key={s.key} className={`relic-sub ${w >= 0.75 ? "good" : w === 0 ? "useless" : ""}`}>
              <img src={asset(STATS[s.key].icon)} alt="" />
              <span>{STATS[s.key].name}</span>
              <span className="rolls">
                {Array.from({ length: s.rolls }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
              <b className="num">{formatStat(s.key, s.value)}</b>
            </div>
            );
          })}
          {selectedScore && (
            <div className="relic-score-line">
              <GradeBadge grade={selectedScore.grade} size="sm" />
              유효 옵션 {selectedScore.score.toFixed(1)}회 / 이상적 {selectedScore.ideal.toFixed(1)}회
              <span className="num">{selectedScore.pct.toFixed(0)}점</span>
            </div>
          )}
        </div>
      )}

      <h3 className="section-title">세트 효과</h3>
      <div className="set-list">
        {[...setCounts.entries()].map(([id, count]) => {
          const set = game.relicSets[id];
          return (
            <div key={id} className="set-item">
              <div className="set-item-head">
                <img src={asset(set.icon)} alt="" />
                <span>{set.name}</span>
                <b className="num">{count}</b>
              </div>
              {set.desc.map((d, i) => {
                const need = set.planar ? 2 : i === 0 ? 2 : 4;
                return (
                  <p key={i} className={count >= need ? "on" : ""}>
                    <em>{need}세트</em> {d}
                  </p>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
