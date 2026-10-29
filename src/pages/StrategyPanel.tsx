import { asset, game } from "../data/game";
import { meta, hasMeta, type MetaTeam } from "../data/meta";
import { auditCharacter } from "../lib/audit";
import { CHALLENGE_NAMES } from "../lib/challenges";
import type { Account, ChallengeKind, OwnedCharacter } from "../types";
import { GradeBadge } from "./AuditPage";
import { RemoteImg } from "../components/MetaBits";

/** Researched info for the current period: weaknesses, recommended teams, characters worth building. */
export function StrategyPanel({ kind, account }: { kind: ChallengeKind; account: Account }) {
  if (!hasMeta()) {
    return (
      <div className="strategy-empty">
        아직 조사된 공략 정보가 없어요. 매주 자동으로 조사해서 채워져요.
      </div>
    );
  }

  const owned = new Map(account.characters.map((c) => [c.id, c]));
  const rotation = meta.rotations?.[kind];
  const teams = (meta.teams ?? [])
    .filter((t) => !t.modes?.length || t.modes.includes(kind))
    .map((t) => ({ team: t, have: ownedCount(t, owned) }))
    .sort((a, b) => b.have - a.have);
  const priority = (meta.buildPriority ?? []).filter((p) => !p.modes?.length || p.modes.includes(kind));

  return (
    <div className="strategy">
      <div className="strategy-main">
        <div className="strategy-meta-line">
          {meta.gameVersion && <>{meta.gameVersion} 버전 · </>}
          <span className="num">{meta.updatedAt.slice(5).replace("-", ".")}</span> 기준
        </div>

        <h3 className="section-title">추천 파티 · {CHALLENGE_NAMES[kind]}</h3>
        {teams.length === 0 ? (
          <div className="strategy-empty small">이 컨텐츠에 맞는 추천 파티 정보가 아직 없어요</div>
        ) : (
          <div className="team-cards">
            {teams.map(({ team, have }) => (
              <TeamCard key={team.id} team={team} have={have} owned={owned} />
            ))}
          </div>
        )}
      </div>

      <aside className="period-side">
        <h3 className="section-title">이번 기간 정보</h3>
        {rotation ? (
          <div className="rotation">
            <b className="rotation-name">{rotation.name}</b>
            {rotation.summary && <p>{rotation.summary}</p>}
            {(rotation.sides ?? []).map((s) => (
              <div key={s.label} className="rotation-side">
                {(rotation.bosses ?? []).filter((b) => b.side === s.label).length > 0 && (
                  <div className="side-bosses">
                    {(rotation.bosses ?? [])
                      .filter((b) => b.side === s.label)
                      .map((b) => (
                        <div key={b.name} className="side-boss">
                          <RemoteImg src={b.image} title={b.name} />
                          <span>{b.name}</span>
                        </div>
                      ))}
                  </div>
                )}
                <span className="side-label">{s.label}</span>
                <div className="side-weak">
                  {(s.weaknesses ?? []).map((e) => (
                    <img key={e} src={asset(game.elements[e]?.icon ?? "")} title={game.elements[e]?.name} alt="" />
                  ))}
                </div>
                {s.enemies?.length ? <div className="side-enemies">{s.enemies.join(", ")}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="strategy-empty small">이번 기간 약점 정보가 아직 없어요</div>
        )}

        {priority.length > 0 && (
          <>
            <h3 className="section-title">육성 추천</h3>
            <div className="priority-list">
              {priority.map((p) => {
                const mine = owned.get(p.charId);
                const audit = mine ? auditCharacter(mine) : undefined;
                return (
                  <div key={p.charId} className={`priority ${mine ? "" : "missing"}`}>
                    <img src={asset(`icon/avatar/${p.charId}.png`)} alt="" />
                    <div>
                      <div className="priority-head">
                        <b>{game.characters[p.charId]?.name ?? p.charId}</b>
                        {audit ? <GradeBadge grade={audit.grade} size="sm" /> : <span className="not-owned">미보유</span>}
                      </div>
                      <p>{p.reason}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

      </aside>
    </div>
  );
}

function ownedCount(t: MetaTeam, owned: Map<string, OwnedCharacter>) {
  return t.members.filter((id) => owned.has(id) || (t.alternatives?.[id] ?? []).some((a) => owned.has(a))).length;
}

function TeamCard({ team, have, owned }: { team: MetaTeam; have: number; owned: Map<string, OwnedCharacter> }) {
  const full = have === team.members.length;
  return (
    <div className={`team-card ${full ? "full" : ""}`}>
      <div className="team-card-head">
        <b>{team.name}</b>
        <span className={`have num ${full ? "ok" : ""}`}>
          보유 {have}/{team.members.length}
        </span>
      </div>
      <div className="team-card-members">
        {team.members.map((id) => {
          const mine = owned.get(id);
          const alts = (team.alternatives?.[id] ?? []).filter((a) => owned.has(a));
          return (
            <div key={id} className={`member ${mine ? "" : "missing"}`}>
              <span className={`eg-avatar r${game.characters[id]?.rarity ?? 4}`} title={game.characters[id]?.name ?? id}>
                <img src={asset(`icon/avatar/${id}.png`)} alt="" />
                {mine?.eidolon ? <i className="num">E{mine.eidolon}</i> : null}
              </span>
              <span className="member-name">{game.characters[id]?.name ?? id}</span>
              {!mine && alts.length > 0 && (
                <span className="member-alt">→ {alts.map((a) => game.characters[a]?.name ?? a).join(", ")}</span>
              )}
            </div>
          );
        })}
      </div>
      {team.note && <p className="team-note">{team.note}</p>}
    </div>
  );
}
