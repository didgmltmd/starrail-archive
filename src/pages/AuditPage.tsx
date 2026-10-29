import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { asset, formatStat, game, SLOT_NAMES, SLOT_ORDER, STATS } from "../data/game";
import { auditCharacter, setLabel, statName, weightedStats, type CharacterAudit, type Grade, type Severity } from "../lib/audit";
import { useExcluded } from "../lib/excluded";
import { statTotal } from "../lib/stats";
import { meta } from "../data/meta";
import { Sources } from "../components/MetaBits";
import type { Account } from "../types";
import "../styles/audit.css";

const GRADES: Grade[] = ["SSS", "SS", "S", "A", "B", "C", "D"];

export function GradeBadge({ grade, size = "md" }: { grade: Grade; size?: "sm" | "md" | "lg" }) {
  return <span className={`grade grade-${grade.toLowerCase()} grade-${size} num`}>{grade}</span>;
}

const SEVERITY_LABEL: Record<Severity, string> = { high: "중요", medium: "보통", low: "참고" };

const SETS_SOURCE: Record<string, string> = {
  "hsr-optimizer": "hsr-optimizer 추천",
  curated: "직접 정리한 추천",
  none: "추천 세트 정보 없음",
};

type Sort = "low" | "high";

export function AuditPage({ account, onOpenCharacter }: { account: Account; onOpenCharacter: (id: string) => void }) {
  const allAudits = useMemo(() => account.characters.map(auditCharacter), [account]);
  const { ids: excludedIds, isExcluded, toggle } = useExcluded();
  const [sort, setSort] = useState<Sort>("low");
  const [selected, setSelected] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<Grade | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);

  // Excluded characters never count toward the summary; they are listed only on request.
  const audits = useMemo(() => allAudits.filter((a) => !excludedIds.includes(a.charId)), [allAudits, excludedIds]);
  const excludedCount = allAudits.length - audits.length;

  const list = useMemo(
    () =>
      (showExcluded ? allAudits.filter((a) => excludedIds.includes(a.charId)) : audits)
        .filter((a) => !gradeFilter || a.grade === gradeFilter)
        .sort((a, b) => (sort === "low" ? a.pct - b.pct : b.pct - a.pct)),
    [allAudits, audits, excludedIds, showExcluded, gradeFilter, sort],
  );
  const current = list.find((a) => a.charId === selected) ?? list[0];

  const counts = Object.fromEntries(GRADES.map((g) => [g, audits.filter((a) => a.grade === g).length]));
  const highIssues = audits.reduce((t, a) => t + a.issues.filter((i) => i.severity === "high").length, 0);

  return (
    <div className="page audit-page">
      <div className="audit-top">
        <div className="grade-dist">
          {GRADES.map((g) => (
            <button
              key={g}
              className={`dist-item ${counts[g] ? "" : "zero"} ${gradeFilter === g ? "on" : ""} ${gradeFilter && gradeFilter !== g ? "dim" : ""}`}
              disabled={!counts[g] && gradeFilter !== g}
              title={gradeFilter === g ? "필터 해제" : `${g} 등급만 보기`}
              onClick={() => {
                setGradeFilter(gradeFilter === g ? null : g);
                setShowExcluded(false);
              }}
            >
              <GradeBadge grade={g} size="sm" />
              <span className="num">{counts[g]}</span>
            </button>
          ))}
          {gradeFilter && (
            <button className="dist-clear" onClick={() => setGradeFilter(null)} title="필터 해제">
              ✕
            </button>
          )}
        </div>
        <div className="audit-stat">
          <span>중요 개선 포인트</span>
          <b className="num">{highIssues}</b>
        </div>
        {excludedCount > 0 && (
          <button className={`excluded-chip ${showExcluded ? "on" : ""}`} onClick={() => setShowExcluded(!showExcluded)}>
            {showExcluded ? "← 육성 중인 캐릭터 보기" : `육성 제외 ${excludedCount}명`}
          </button>
        )}
        <div className="toggle">
          <button className={sort === "low" ? "on" : ""} onClick={() => setSort("low")}>
            점수 낮은 순
          </button>
          <button className={sort === "high" ? "on" : ""} onClick={() => setSort("high")}>
            점수 높은 순
          </button>
        </div>
      </div>

      <div className="split">
        <div className="split-list">
          {list.length === 0 && <div className="all-good">해당하는 캐릭터가 없어요</div>}
          {list.map((a, i) => {
            const info = game.characters[a.charId];
            const high = a.issues.filter((x) => x.severity === "high").length;
            return (
              <motion.button
                key={a.charId}
                className={`audit-row ${current?.charId === a.charId ? "on" : ""}`}
                onClick={() => setSelected(a.charId)}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
              >
                <img className={`row-avatar r${info.rarity}`} src={asset(`icon/avatar/${a.charId}.png`)} alt="" />
                <div className="row-main">
                  <div className="row-name">
                    <img src={asset(game.elements[info.element].icon)} alt="" />
                    {info.name}
                  </div>
                  <div className="row-issue">{a.issues[0]?.message ?? "세팅이 깔끔해요"}</div>
                </div>
                {high > 0 && <span className="issue-count num">{high}</span>}
                <div className="row-score">
                  <GradeBadge grade={a.grade} />
                  <div className="bar">
                    <i style={{ width: `${a.pct}%` }} />
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {current && (
            <motion.div
              key={current.charId}
              className="split-detail"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
            >
              <AuditDetail
                audit={current}
                account={account}
                onOpen={() => onOpenCharacter(current.charId)}
                excluded={isExcluded(current.charId)}
                onToggleExcluded={() => toggle(current.charId)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SetChip({ id, count }: { id: string; count?: number }) {
  const set = game.relicSets[id];
  if (!set) return null;
  return (
    <span className="set-chip" title={set.name}>
      <img src={asset(set.icon)} alt="" />
      <span>{set.name}</span>
      {count !== undefined && <b className="num">{count}</b>}
    </span>
  );
}

function Verdict({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="verdict none">기준 없음</span>;
  return <span className={`verdict ${ok ? "ok" : "bad"}`}>{ok ? "추천과 일치" : "추천과 다름"}</span>;
}

function AuditDetail({
  audit,
  account,
  onOpen,
  excluded,
  onToggleExcluded,
}: {
  audit: CharacterAudit;
  account: Account;
  onOpen: () => void;
  excluded: boolean;
  onToggleExcluded: () => void;
}) {
  const info = game.characters[audit.charId];
  const character = account.characters.find((c) => c.id === audit.charId)!;
  const { build } = audit;

  return (
    <div className="detail-scroll">
      <div className="detail-hero">
        <img className="hero-art" src={asset(info.preview)} alt="" />
        <div className="hero-info">
          <div className="hero-tags">
            <img src={asset(game.elements[info.element].icon)} alt="" />
            <img src={asset(game.paths[info.path].icon)} alt="" />
            <span className="num">Lv.{character.level}</span>
            <span className="num">성혼 {character.eidolon}</span>
          </div>
          <h2>{info.name}</h2>
          <div className="hero-score">
            <GradeBadge grade={audit.grade} size="lg" />
            <div>
              <div className="num hero-pct">{audit.pct.toFixed(0)}점</div>
              <div className="hero-note">이상적인 세팅 대비 점수</div>
            </div>
          </div>
          <div className="hero-actions">
            <button className="pill-btn" onClick={onOpen}>
              캐릭터 보기
            </button>
            <button className="pill-btn ghost" onClick={onToggleExcluded}>
              {excluded ? "다시 육성 대상으로" : "육성 안 함"}
            </button>
          </div>
          {excluded && <div className="hero-note">육성 제외 · 세팅 점검 요약과 파밍 추천 계산에서 빠져요</div>}
        </div>
      </div>

      <h3 className="section-title">세트</h3>
      <div className="set-block">
        <div className="set-row">
          <span className="set-kind">동굴</span>
          <div className="set-chips">
            {audit.cavern.current.map((s) => (
              <SetChip key={s.setId} id={s.setId} count={s.count} />
            ))}
          </div>
          <Verdict ok={audit.cavern.ok} />
        </div>
        {build.relicSets.length > 0 && (
          <div className="set-rec">
            추천 ·{" "}
            {build.relicSets.map((p, i) => (
              <span key={i} className={i === audit.cavern.matchIndex ? "hit" : ""}>
                {setLabel(p)}
              </span>
            ))}
          </div>
        )}
        <div className="set-row">
          <span className="set-kind">차원장식</span>
          <div className="set-chips">
            {audit.planar.current.map((s) => (
              <SetChip key={s.setId} id={s.setId} count={s.count} />
            ))}
          </div>
          <Verdict ok={audit.planar.ok} />
        </div>
        {build.ornamentSets.length > 0 && (
          <div className="set-rec">
            추천 ·{" "}
            {build.ornamentSets.map((id, i) => (
              <span key={id} className={i === audit.planar.matchIndex ? "hit" : ""}>
                {game.relicSets[id]?.name ?? id}
              </span>
            ))}
          </div>
        )}
        <div className="source-note">{SETS_SOURCE[build.setsSource]}</div>
      </div>

      <h3 className="section-title">부위별 점검</h3>
      <div className="slot-grid">
        {SLOT_ORDER.map((slot) => {
          const s = audit.slots[slot];
          const r = s.relic;
          const mainOk = s.score?.mainOk;
          return (
            <div key={slot} className={`slot-card ${mainOk === false ? "bad" : ""}`}>
              <div className="slot-head">
                <div className={`relic-icon sm r${r?.rarity ?? 0}`}>
                  {r && <img src={asset(game.relicSets[r.setId]?.pieces[slot] ?? "")} alt="" />}
                  {r && <span className={`relic-lv num ${r.level < 15 ? "low" : ""}`}>+{r.level}</span>}
                </div>
                <div className="slot-info">
                  <div className="slot-top">
                    <span>{SLOT_NAMES[slot]}</span>
                    {s.score && <GradeBadge grade={s.score.grade} size="sm" />}
                  </div>
                  {r ? (
                    <div className={`slot-main ${mainOk === false ? "bad" : mainOk ? "ok" : ""}`}>
                      <img src={asset(STATS[r.main.key].icon)} alt="" />
                      {statName(r.main.key)} <span className="num">{formatStat(r.main.key, r.main.value)}</span>
                    </div>
                  ) : (
                    <div className="slot-main bad">비어 있음</div>
                  )}
                  {mainOk === false && <div className="slot-rec">→ {s.recommended.map(statName).join(" / ")}</div>}
                </div>
              </div>
              {r && r.subs.length > 0 && (
                <div className="slot-subs">
                  {r.subs.map((sub) => {
                    const w = s.score?.subs.find((x) => x.key === sub.key)?.weight ?? 0;
                    return (
                      <div key={sub.key} className={`slot-sub ${w >= 0.75 ? "good" : w === 0 ? "dead" : ""}`}>
                        <img src={asset(STATS[sub.key].icon)} alt="" />
                        <span className="sub-name">{statName(sub.key)}</span>
                        <span className="rolls">
                          {Array.from({ length: sub.rolls }, (_, i) => (
                            <i key={i} />
                          ))}
                        </span>
                        <b className="num">{formatStat(sub.key, sub.value)}</b>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <BenchmarkSection charId={audit.charId} character={character} />
      <TeamBuildSection charId={audit.charId} />

      <h3 className="section-title">유효 부옵션</h3>
      <div className="weights">
        {weightedStats(build).map((w) => (
          <div key={w.key} className={`weight ${w.weight >= 0.75 ? "strong" : ""}`}>
            <img src={asset(STATS[w.key].icon)} alt="" />
            <span>{statName(w.key)}</span>
            <div className="bar">
              <i style={{ width: `${w.weight * 100}%` }} />
            </div>
          </div>
        ))}
        {build.source === "fallback" && <div className="source-note">운명의 길 기준으로 추정한 값이에요</div>}
      </div>

      <h3 className="section-title">개선 포인트</h3>
      {audit.issues.length === 0 ? (
        <div className="all-good">개선할 부분이 없어요</div>
      ) : (
        <ul className="issues">
          {audit.issues.map((i, k) => (
            <li key={k} className={`sev-${i.severity}`}>
              <span className="sev">{SEVERITY_LABEL[i.severity]}</span>
              {i.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "이잘키" (well-built) stat thresholds from the weekly research, compared with the in-game stats. */
function BenchmarkSection({ charId, character }: { charId: string; character: Account["characters"][number] }) {
  const b = meta.benchmarks?.[charId];
  if (!b) return null;
  const rows = Object.entries(b.stats) as [keyof typeof STATS, number][];
  const met = rows.filter(([k, v]) => statTotal(character, k) >= v).length;
  const eidolonOk = b.eidolon === undefined || character.eidolon >= b.eidolon;
  return (
    <>
      <h3 className="section-title">이잘키 기준</h3>
      <div className="bench">
        <div className="bench-head">
          <span className={`bench-verdict ${met === rows.length ? "ok" : ""}`}>
            {met === rows.length ? "기준 달성" : `${rows.length}개 중 ${met}개 달성`}
          </span>
          {b.eidolon !== undefined && (
            <span className={`bench-eid ${eidolonOk ? "" : "warn"}`}>성혼 {b.eidolon} 이상 기준</span>
          )}
        </div>
        {rows.map(([k, v]) => {
          const cur = statTotal(character, k);
          const ok = cur >= v;
          return (
            <div key={k} className={`bench-row ${ok ? "ok" : "bad"}`}>
              <img src={asset(STATS[k].icon)} alt="" />
              <span>{statName(k)}</span>
              <span className="num bench-cur">{formatStat(k, cur)}</span>
              <span className="num bench-target">/ {formatStat(k, v)}</span>
              <b>{ok ? "✓" : "✗"}</b>
            </div>
          );
        })}
        {b.note && <p className="bench-note">{b.note}</p>}
        <Sources sources={b.sources} />
      </div>
    </>
  );
}

/** Team- or eidolon-specific builds that differ from the default recommendation. */
function TeamBuildSection({ charId }: { charId: string }) {
  const list = (meta.teamBuilds ?? []).filter((t) => t.charId === charId);
  if (!list.length) return null;
  return (
    <>
      <h3 className="section-title">파티별 · 돌파별 세팅</h3>
      <div className="team-builds">
        {list.map((t, i) => (
          <div key={i} className="team-build">
            <b>{t.when}</b>
            <div className="team-build-sets">
              {(t.relicSets ?? []).map((p, j) => (
                <span key={j} className="chip">{setLabel(p)}</span>
              ))}
              {(t.ornamentSets ?? []).map((id) => (
                <span key={id} className="chip">{game.relicSets[id]?.name ?? id}</span>
              ))}
              {Object.entries(t.mains ?? {}).map(([slot, keys]) => (
                <span key={slot} className="chip">
                  {SLOT_NAMES[slot as keyof typeof SLOT_NAMES]} · {(keys ?? []).map(statName).join(" / ")}
                </span>
              ))}
            </div>
            {t.note && <p>{t.note}</p>}
            <Sources sources={t.sources} />
          </div>
        ))}
      </div>
    </>
  );
}
