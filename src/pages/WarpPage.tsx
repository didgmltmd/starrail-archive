import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { IconRefresh } from "../components/icons";
import { asset, game } from "../data/game";
import { timeAgo } from "../lib/hoyolab";
import {
  analyze,
  BANNERS,
  describeNotice,
  JADE_PER_PULL,
  standardPool,
  type BannerId,
  type BannerStats,
  type FiveStar,
  type Pull,
  type WarpState,
} from "../lib/warps";
import "../styles/warp.css";

const itemIcon = (item: string) => {
  const path = game.characters[item]?.icon ?? game.lightCones[item]?.icon;
  return path ? asset(path) : null;
};
const itemName = (p: Pull) => game.characters[p.item]?.name ?? game.lightCones[p.item]?.name ?? p.name;
const shortDate = (t: string) => t.slice(2, 10).replace(/-/g, ".");
const jade = (pulls: number) => (pulls * JADE_PER_PULL).toLocaleString();
const pityLevel = (pity: number, hard: number) => (pity / hard <= 0.45 ? "low" : pity / hard <= 0.8 ? "mid" : "high");

export function WarpPage({ state }: { state: WarpState }) {
  const { data, busy } = state;
  const stats = useMemo(() => {
    const pulls = data?.pulls ?? [];
    const pool = standardPool(pulls);
    return BANNERS.map((b) => analyze(b, pulls, pool)).filter(
      (s) => ["char", "lc", "standard"].includes(s.banner.id) || (s.banner.id === "departure" ? s.total > 0 && s.total < 50 : s.total > 0),
    );
  }, [data]);
  const [selected, setSelected] = useState<BannerId>("char");
  const current = stats.find((s) => s.banner.id === selected) ?? stats[0];
  const total = data?.pulls.length ?? 0;

  return (
    <div className="page warp-page">
      <div className="warp-top">
        {data && (
          <div className="warp-summary">
            <span>
              전체 <b className="num">{total.toLocaleString()}</b>회
            </span>
            <span className="dot" />
            <span>
              성옥 환산 <b className="num">{jade(total)}</b>
            </span>
            <span className="dot" />
            <span className="warp-uid num">UID {data.uid}</span>
          </div>
        )}
        <StatusLine state={state} />
        <button className="warp-refresh" onClick={() => state.sync()} disabled={busy}>
          <IconRefresh className={busy ? "spin" : ""} />
          지금 가져오기
        </button>
      </div>

      {!data ? (
        <WarpEmpty state={state} />
      ) : (
        <>
          <div className="warp-cards">
            {stats.map((s, i) => (
              <motion.div
                key={s.banner.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.25 }}
              >
                <BannerCard stats={s} active={s.banner.id === current.banner.id} onClick={() => setSelected(s.banner.id)} />
              </motion.div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={current.banner.id}
              className="warp-detail"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <FiveStarList stats={current} />
              <SideStats stats={current} />
            </motion.div>
          </AnimatePresence>
          <ManualUrl state={state} />
        </>
      )}
    </div>
  );
}

function StatusLine({ state }: { state: WarpState }) {
  const { busy, progress, notice, error, data } = state;
  if (busy) return <span className="warp-status busy">{progress ?? "가져오는 중"}</span>;
  if (error) return <span className="warp-status error" title={error}>{error}</span>;
  if (notice && data) return <span className="warp-status">{describeNotice(notice)}</span>;
  if (data) return <span className="warp-status">{timeAgo(data.updatedAt)} 갱신 · 게임에서 워프 기록을 열면 자동으로 갱신돼요</span>;
  return <span className="warp-status" />;
}

function PityRing({ value, max }: { value: number; max: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const ratio = Math.min(1, value / max);
  return (
    <div className={`pity-ring ${pityLevel(value, max)}`}>
      <svg viewBox="0 0 96 96">
        <circle className="track" cx="48" cy="48" r={r} />
        <motion.circle
          className="arc"
          cx="48"
          cy="48"
          r={r}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - ratio) }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <div className="pity-ring-text">
        <b className="num">{value}</b>
        <span className="num">/ {max}</span>
      </div>
    </div>
  );
}

function BannerCard({ stats, active, onClick }: { stats: BannerStats; active: boolean; onClick: () => void }) {
  const { banner, pity5, pity4, guaranteed, fives, total } = stats;
  return (
    <button className={`warp-card warp-${banner.id} ${active ? "on" : ""}`} onClick={onClick}>
      <div className="warp-card-head">
        <span className="warp-card-name">{banner.label}</span>
        {banner.event && (
          <span className={`warp-badge ${guaranteed ? "sure" : ""}`} title={guaranteed ? "직전 5성이 픽업이 아니어서 다음 5성은 픽업 확정" : "다음 5성이 픽업일 확률"}>
            {guaranteed ? "픽업 확정" : banner.featuredRate}
          </span>
        )}
      </div>
      <div className="warp-card-body">
        <PityRing value={pity5} max={banner.hard} />
        <dl className="warp-card-stats">
          <div>
            <dt>4성 천장</dt>
            <dd className="num">
              {pity4}
              <small>/10</small>
            </dd>
          </div>
          <div>
            <dt>5성</dt>
            <dd className="num">{fives.length}</dd>
          </div>
          <div>
            <dt>총 워프</dt>
            <dd className="num">{total.toLocaleString()}</dd>
          </div>
        </dl>
      </div>
      <div className="warp-card-foot">
        5성 확정까지 <b className="num">{banner.hard - pity5}</b>회
      </div>
    </button>
  );
}

function ResultTag({ result }: { result?: FiveStar["result"] }) {
  if (result === "lost") return <span className="five-tag lost">픽뚫</span>;
  if (result === "guaranteed") return <span className="five-tag sure">확정</span>;
  if (result === "won") return <span className="five-tag won">픽업</span>;
  return null;
}

function FiveStarList({ stats }: { stats: BannerStats }) {
  const { banner, fives, pity5 } = stats;
  return (
    <section className="warp-panel five-list">
      <header>
        <h3>5성 기록</h3>
        <span className="num">{fives.length}개</span>
        <span className="five-legend">
          막대 = 5성까지 걸린 횟수 (최대 {banner.hard})
        </span>
      </header>
      <div className="five-rows">
        <div className="five-row pending">
          <div className="five-icon unknown">?</div>
          <div className="five-name">
            <b>다음 5성</b>
            <span>진행 중</span>
          </div>
          <div className="five-bar">
            <motion.i
              className={pityLevel(pity5, banner.hard)}
              initial={{ width: 0 }}
              animate={{ width: `${(pity5 / banner.hard) * 100}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>
          <b className="five-pity num">{pity5}</b>
          <span className="five-tag ghost">{stats.guaranteed ? "픽업 확정" : ""}</span>
        </div>
        {fives.map((f, i) => {
          const icon = itemIcon(f.pull.item);
          return (
            <motion.div
              key={f.pull.id}
              className="five-row"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.03 }}
            >
              <div className={`five-icon ${f.result ?? ""}`}>{icon ? <img src={icon} alt="" /> : null}</div>
              <div className="five-name">
                <b>{itemName(f.pull)}</b>
                <span className="num">{shortDate(f.pull.time)}</span>
              </div>
              <div className="five-bar">
                <motion.i
                  className={pityLevel(f.pity, banner.hard)}
                  initial={{ width: 0 }}
                  animate={{ width: `${(f.pity / banner.hard) * 100}%` }}
                  transition={{ duration: 0.6, delay: Math.min(i, 12) * 0.03 }}
                />
              </div>
              <b className="five-pity num">{f.pity}</b>
              <ResultTag result={f.result} />
            </motion.div>
          );
        })}
        {fives.length === 0 && <div className="five-none">아직 이 워프에서 뽑은 5성이 없어요</div>}
      </div>
    </section>
  );
}

function SideStats({ stats }: { stats: BannerStats }) {
  const { banner, pity5, guaranteed, avgPity, won, lost, fives, fourCount, recentFours } = stats;
  const toHard = banner.hard - pity5;
  const worst = banner.event ? (guaranteed ? toHard : toHard + banner.hard) : null;
  const decided = won + lost;
  return (
    <aside className="warp-panel warp-side">
      <div className="wside-block">
        <span className="wside-label">5성 확정까지</span>
        <div className="wside-big">
          <b className="num">{toHard}</b>회<small className="num">성옥 {jade(toHard)}</small>
        </div>
      </div>
      {worst !== null && (
        <div className="wside-block">
          <span className="wside-label">픽업 확정까지 (최악의 경우)</span>
          <div className="wside-big">
            <b className="num">{worst}</b>회<small className="num">성옥 {jade(worst)}</small>
          </div>
          <p className="wside-note">
            {guaranteed
              ? "직전 5성이 픽뚫이라 다음 5성은 픽업이에요."
              : `다음 5성이 픽뚫이면 한 번 더 ${banner.hard}회가 필요해요.`}
          </p>
        </div>
      )}
      <div className="wside-grid">
        <div>
          <span className="wside-label">평균 5성 천장</span>
          <b className="num">{avgPity === null ? "-" : avgPity.toFixed(1)}</b>
        </div>
        {banner.event && (
          <div>
            <span className="wside-label">픽업 / 픽뚫</span>
            <b className="num">
              {won}
              <i>/</i>
              {lost}
            </b>
            {decided > 0 && <small className="num">{Math.round((won / decided) * 100)}% 성공</small>}
          </div>
        )}
        <div>
          <span className="wside-label">5성 / 4성</span>
          <b className="num">
            {fives.length}
            <i>/</i>
            {fourCount}
          </b>
        </div>
      </div>
      {recentFours.length > 0 && (
        <div className="wside-block">
          <span className="wside-label">최근 4성</span>
          <div className="four-grid">
            {recentFours.map((p) => {
              const icon = itemIcon(p.item);
              return (
                <div key={p.id} className="four-item" title={`${itemName(p)} · ${shortDate(p.time)}`}>
                  {icon ? <img src={icon} alt="" /> : <span>{itemName(p).slice(0, 2)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}

function WarpEmpty({ state }: { state: WarpState }) {
  return (
    <div className="warp-empty">
      <h2>워프 기록 가져오기</h2>
      <p className="warp-empty-lead">
        {state.notice ? describeNotice(state.notice) : state.error ?? "게임이 이 PC에 남기는 기록 주소로 자동으로 가져와요."}
      </p>
      <ol className="warp-steps">
        <li>
          <b>1</b>
          <span>이 PC에서 붕괴: 스타레일을 켜요</span>
        </li>
        <li>
          <b>2</b>
          <span>
            워프 화면 왼쪽 아래 <em>기록</em>을 한 번 열어요
          </span>
        </li>
        <li>
          <b>3</b>
          <span>앱이 알아서 가져와요. 다음부터는 기록만 열면 새 워프가 추가돼요</span>
        </li>
      </ol>
      <button className="pill-btn" onClick={() => state.sync()} disabled={state.busy}>
        {state.busy ? state.progress ?? "가져오는 중" : "지금 가져오기"}
      </button>
      <p className="warp-empty-note">
        게임 서버는 최근 6개월 기록만 보여줘요. 한 번 가져온 기록은 이 PC에 계속 쌓여서 6개월이 지나도 남아요.
      </p>
      <ManualUrl state={state} />
    </div>
  );
}

/** Fallback when the game's log can't be found (e.g. moved install): paste the history address by hand. */
function ManualUrl({ state }: { state: WarpState }) {
  const [url, setUrl] = useState("");
  return (
    <details className="warp-manual">
      <summary>자동으로 안 될 때: 워프 기록 주소 직접 넣기</summary>
      <div className="warp-manual-row">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://...authkey=..." spellCheck={false} />
        <button
          className="warp-refresh"
          disabled={!url.includes("authkey=") || state.busy}
          onClick={() => state.sync({ manualUrl: url }).then(() => setUrl(""))}
        >
          가져오기
        </button>
      </div>
    </details>
  );
}
