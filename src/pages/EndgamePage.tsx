import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { IconStar } from "../components/icons";
import { asset, game } from "../data/game";
import { CHALLENGE_KINDS, CHALLENGE_NAMES, daysLeft, maxStars } from "../lib/challenges";
import type { Account, ChallengeKind, ChallengePeriod, ChallengeTeam } from "../types";
import "../styles/endgame.css";

type Which = "current" | "previous";

const TEAM_LABEL = ["전반", "후반", "3번째"];

export function EndgamePage({ account, title }: { account: Account; title?: string }) {
  const [which, setWhich] = useState<Which>("current");
  const [kind, setKind] = useState<ChallengeKind>("moc");
  const records = account.challenges?.[which];
  const period = records?.[kind];

  if (!account.challenges) {
    return (
      <div className="page endgame-page">
        <div className="endgame-empty">
          {account.source === "hoyolab"
            ? "엔드 컨텐츠 기록이 아직 없어요. 상단의 동기화 버튼을 눌러 주세요."
            : "HoYoLAB을 연동하면 혼돈의 기억 · 허구 이야기 · 종말의 환영 기록이 여기에 나와요."}
        </div>
      </div>
    );
  }

  return (
    <div className="page endgame-page">
      <div className="endgame-top">
        {title && <span className="endgame-owner">{title}</span>}
        <p className="endgame-lead">HoYoLAB에 기록된 실제 클리어 기록이에요.</p>
        <div className="toggle">
          {(
            [
              ["current", "이번 기간"],
              ["previous", "지난 기간"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={which === id ? "on" : ""} onClick={() => setWhich(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mode-cards">
        {CHALLENGE_KINDS.map((k) => (
          <ModeCard
            key={k}
            kind={k}
            period={records?.[k]}
            active={kind === k}
            showDays={which === "current"}
            onClick={() => setKind(k)}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={which + kind}
          className="mode-detail"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {period?.hasData ? <PeriodDetail period={period} /> : <div className="endgame-empty small">이 기간에는 도전 기록이 없어요</div>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Stars({ n, of = 3 }: { n: number; of?: number }) {
  return (
    <span className="eg-stars">
      {Array.from({ length: of }, (_, i) => (
        <IconStar key={i} className={i < n ? "on" : ""} />
      ))}
    </span>
  );
}

function ModeCard({
  kind,
  period,
  active,
  showDays,
  onClick,
}: {
  kind: ChallengeKind;
  period?: ChallengePeriod;
  active: boolean;
  showDays: boolean;
  onClick: () => void;
}) {
  const left = showDays ? daysLeft(period) : null;
  const max = period ? maxStars(period) : 0;
  return (
    <button className={`mode-card mode-${kind} ${active ? "on" : ""}`} onClick={onClick}>
      <div className="mode-head">
        <span className="mode-kind">{CHALLENGE_NAMES[kind]}</span>
        {left !== null && <span className="mode-days num">D-{left}</span>}
      </div>
      <div className="mode-name">{period?.name ?? "-"}</div>
      <div className="mode-dates num">{period?.begin ? `${fmtDate(period.begin)} ~ ${fmtDate(period.end)}` : ""}</div>
      <div className="mode-progress">
        <IconStar className="on" />
        <b className="num">{period?.stars ?? 0}</b>
        <span className="num">/ {max}</span>
        <div className="bar">
          <i style={{ width: `${max ? ((period?.stars ?? 0) / max) * 100 : 0}%` }} />
        </div>
      </div>
      {period?.maxFloor && <div className="mode-floor">최고 {period.maxFloor}</div>}
    </button>
  );
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function PeriodDetail({ period }: { period: ChallengePeriod }) {
  // Buffs seen in this period (only floors that were played report them)
  const buffs = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of period.floors) for (const t of f.teams) if (t.buff) m.set(t.buff.name, t.buff.desc);
    return [...m.entries()];
  }, [period]);

  // Characters used this period, most used first
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of period.floors) for (const t of f.teams) for (const a of t.avatars) m.set(a.id, (m.get(a.id) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [period]);

  // Floors cleared with "quick challenge" have no team data; fold them into one line.
  const played = period.floors.filter((f) => f.teams.length > 0);
  const quick = period.floors.filter((f) => f.teams.length === 0);

  return (
    <div className="period-detail">
      <div className="period-floors">
        {quick.length > 0 && (
          <div className="floor-row quick">
            <div className="floor-head">
              <span className="floor-name">빠른 도전으로 넘긴 층 {quick.length}개</span>
              <IconStar className="quick-star" />
              <b className="num">{quick.reduce((t, f) => t + f.stars, 0)}</b>
              <span className="floor-meta">{quick.map((f) => f.name.split("•").pop()).join(", ")}</span>
            </div>
          </div>
        )}
        {played.map((f) => {
          const total = f.teams.reduce((t, x) => t + (x.score ?? 0), 0);
          return (
            <div key={f.name} className={`floor-row ${f.stars === 3 ? "full" : ""}`}>
              <div className="floor-head">
                <span className="floor-name">{f.name}</span>
                <Stars n={f.stars} />
                {period.kind === "moc" && f.rounds ? <span className="floor-meta num">{f.rounds} 사이클</span> : null}
                {period.kind !== "moc" && total > 0 && <span className="floor-meta num">{total.toLocaleString()}점</span>}
                {f.fast && <span className="floor-tag">빠른 도전</span>}
              </div>
              <div className="floor-teams">
                {f.teams.map((t, i) => (
                  <TeamLine key={i} label={TEAM_LABEL[i]} team={t} kind={period.kind} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <aside className="period-side">
        {period.bosses.length > 0 && (
          <>
            <h3 className="section-title">보스</h3>
            <div className="side-chips">
              {period.bosses.map((b) => (
                <span key={b} className="chip">
                  {b}
                </span>
              ))}
            </div>
          </>
        )}
        {buffs.length > 0 && (
          <>
            <h3 className="section-title">이번 기간 버프</h3>
            <div className="buff-list">
              {buffs.map(([name, desc]) => (
                <div key={name} className="buff">
                  <b>{name}</b>
                  <p>{desc}</p>
                </div>
              ))}
            </div>
          </>
        )}
        <h3 className="section-title">사용한 캐릭터</h3>
        <div className="usage">
          {usage.map(([id, n]) => (
            <div key={id} className="usage-item" title={game.characters[id]?.name ?? id}>
              <Avatar id={id} />
              <span className="num">×{n}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function Avatar({ id, eidolon }: { id: string; eidolon?: number }) {
  const info = game.characters[id];
  return (
    <span className={`eg-avatar r${info?.rarity ?? 4}`} title={info?.name ?? id}>
      <img src={asset(`icon/avatar/${id}.png`)} alt="" />
      {eidolon ? <i className="num">E{eidolon}</i> : null}
    </span>
  );
}

function TeamLine({ label, team, kind }: { label: string; team: ChallengeTeam; kind: ChallengeKind }) {
  return (
    <div className="team-line">
      <span className="team-label">{label}</span>
      <div className="team-avatars">
        {team.avatars.map((a) => (
          <Avatar key={a.id} id={a.id} eidolon={a.eidolon} />
        ))}
      </div>
      <div className="team-meta">
        {kind !== "moc" && team.score !== undefined && <b className="num">{team.score.toLocaleString()}</b>}
        {kind === "as" && team.bossDefeated !== undefined && (
          <span className={team.bossDefeated ? "ok" : "bad"}>{team.bossDefeated ? "격파" : "미격파"}</span>
        )}
        {team.buff && (
          <span className="team-buff" title={team.buff.desc}>
            {team.buff.name}
          </span>
        )}
      </div>
    </div>
  );
}

/** Compact star summary used on friend cards. */
export function ChallengeSummary({ account }: { account: Account }) {
  const cur = account.challenges?.current;
  if (!cur) return null;
  return (
    <div className="eg-summary">
      {CHALLENGE_KINDS.map((k) => {
        const p = cur[k];
        return (
          <span key={k} className="eg-summary-item" title={`${CHALLENGE_NAMES[k]} ${p?.name ?? ""}`}>
            <em>{CHALLENGE_NAMES[k].slice(0, 2)}</em>
            <IconStar className="on" />
            <b className="num">{p?.hasData ? p.stars : "-"}</b>
          </span>
        );
      })}
    </div>
  );
}
