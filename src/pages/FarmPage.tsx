import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { asset, game, SLOT_NAMES } from "../data/game";
import { statName } from "../lib/audit";
import { useExcluded, withoutExcluded } from "../lib/excluded";
import { rankDomains, REASON_LABEL, type DomainRank } from "../lib/farming";
import type { Account } from "../types";
import "../styles/audit.css";

type Filter = "all" | "cavern" | "planar";

const KIND_LABEL = { cavern: "침식된 동굴", planar: "차원장식" };

export function FarmPage({ account, onOpenCharacter }: { account: Account; onOpenCharacter: (id: string) => void }) {
  const { ids: excludedIds, toggle } = useExcluded();
  const ranks = useMemo(() => rankDomains(withoutExcluded(account, excludedIds)), [account, excludedIds]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const list = ranks.filter((r) => filter === "all" || r.domain.kind === filter);
  const max = Math.max(1, ...ranks.map((r) => r.need));
  const current = list.find((r) => r.domain.id === selected) ?? list[0];

  return (
    <div className="page audit-page">
      <div className="audit-top">
        <p className="farm-lead">
          보유 캐릭터 전체의 부족한 부분을 모아서, 지금 돌면 가장 많은 캐릭터가 좋아지는 곳부터 보여줘요.
          {excludedIds.length > 0 && <em className="farm-excluded"> · 육성 제외 {excludedIds.length}명은 계산에서 빠져요</em>}
        </p>
        <div className="toggle">
          {(
            [
              ["all", "전체"],
              ["cavern", "동굴"],
              ["planar", "차원장식"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="all-good big">지금은 급하게 파밍할 곳이 없어요. 세팅이 잘 되어 있어요!</div>
      ) : (
        <div className="split">
          <div className="split-list">
            {list.map((r, i) => (
              <motion.button
                key={r.domain.id}
                className={`domain-card ${current?.domain.id === r.domain.id ? "on" : ""}`}
                onClick={() => setSelected(r.domain.id)}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
              >
                <span className={`rank num ${i < 3 ? "top" : ""}`}>{i + 1}</span>
                <div className="domain-icons">
                  {r.domain.sets.map((s) =>
                    game.relicSets[s] ? <img key={s} src={asset(game.relicSets[s].icon)} alt="" /> : null,
                  )}
                </div>
                <div className="domain-main">
                  <span className="domain-kind">{KIND_LABEL[r.domain.kind]}</span>
                  <div className="domain-names">
                    {r.domain.sets.map((s) => (
                      <span key={s}>{game.relicSets[s]?.name ?? "?"}</span>
                    ))}
                  </div>
                  <div className="bar">
                    <i style={{ width: `${(r.need / max) * 100}%` }} />
                  </div>
                </div>
                <div className="domain-avatars">
                  {r.characters.slice(0, 4).map((c) => (
                    <img key={c.charId} src={asset(`icon/avatar/${c.charId}.png`)} alt="" />
                  ))}
                  {r.characters.length > 4 && <span className="num">+{r.characters.length - 4}</span>}
                </div>
              </motion.button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {current && (
              <motion.div
                key={current.domain.id}
                className="split-detail"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
              >
                <DomainDetail rank={current} onOpen={onOpenCharacter} onExclude={toggle} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function DomainDetail({
  rank,
  onOpen,
  onExclude,
}: {
  rank: DomainRank;
  onOpen: (id: string) => void;
  onExclude: (id: string) => void;
}) {
  return (
    <div className="detail-scroll">
      <span className="domain-kind">{KIND_LABEL[rank.domain.kind]}</span>
      <div className="domain-sets">
        {rank.domain.sets.map((id) => {
          const set = game.relicSets[id];
          if (!set) return null;
          const wanted = rank.characters.filter((c) => c.setId === id).length;
          return (
            <div key={id} className={`domain-set ${wanted ? "" : "dim"}`}>
              <img src={asset(set.icon)} alt="" />
              <div>
                <b>{set.name}</b>
                <span>{wanted ? `${wanted}명이 필요해요` : "지금은 필요한 캐릭터 없음"}</span>
              </div>
            </div>
          );
        })}
      </div>

      {rank.wanted.length > 0 && (
        <>
          <h3 className="section-title">노려야 할 주옵션</h3>
          <div className="wanted">
            {rank.wanted.slice(0, 8).map((w) => (
              <span key={`${w.slot}${w.key}`} className="chip">
                {SLOT_NAMES[w.slot]} · {statName(w.key)}
                {w.count > 1 && <b className="num"> ×{w.count}</b>}
              </span>
            ))}
          </div>
        </>
      )}

      <h3 className="section-title">캐릭터별 필요한 부분</h3>
      <div className="need-list">
        {rank.characters.map((c) => {
          const info = game.characters[c.charId];
          return (
            <div key={c.charId + c.setId} className="need-card">
              <div className="need-top">
                <button className="need-head" onClick={() => onOpen(c.charId)} title="캐릭터 보기">
                  <img className={`row-avatar r${info.rarity}`} src={asset(`icon/avatar/${c.charId}.png`)} alt="" />
                  <div>
                    <b>{info.name}</b>
                    <span>
                      {game.relicSets[c.setId]?.name}
                      {c.setPieces ? ` ${c.setPieces}세트 맞추기` : ""}
                    </span>
                  </div>
                </button>
                <button className="need-exclude" onClick={() => onExclude(c.charId)} title="이 캐릭터는 계산에서 빼기">
                  육성 안 함
                </button>
              </div>
              <div className="need-slots">
                {c.slots.map((s) => (
                  <span key={s.slot} className={`need-slot reason-${s.reason}`}>
                    <em>{SLOT_NAMES[s.slot]}</em>
                    {REASON_LABEL[s.reason]}
                    {s.targetMains.length > 0 && (
                      <small> → {s.targetMains.slice(0, 2).map(statName).join(" / ")}</small>
                    )}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
