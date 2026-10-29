import { motion } from "motion/react";
import { IconRefresh } from "../components/icons";
import {
  CHECKIN_PAGE,
  clockText,
  durationText,
  reachAt,
  secondsToFull,
  staminaNow,
  type DailyState,
  type Note,
} from "../lib/daily";
import { timeAgo } from "../lib/hoyolab";
import { openExternal } from "../lib/openExternal";
import "../styles/tools.css";
import "../styles/today.css";

export function TodayPage({ state, linked, onLink }: { state: DailyState; linked: boolean; onLink: () => void }) {
  const { note, noteAt, loading, noteError, now } = state;

  if (!linked) {
    return (
      <div className="page tool-page">
        <div className="tool-empty">
          <h2>HoYoLAB 연동이 필요해요</h2>
          개척력, 일일 훈련, 출석 체크는 HoYoLAB 계정으로 가져와요.
          <br />
          <button className="tool-btn primary" onClick={onLink}>
            HoYoLAB 연동하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page tool-page today-page">
      <div className="tool-top">
        <span className={`tool-status ${noteError ? "error" : ""}`} title={noteError ?? undefined}>
          {noteError ?? (noteAt ? `${timeAgo(new Date(noteAt).toISOString())} 갱신 · 15분마다 자동으로 갱신돼요` : "")}
        </span>
        <button className="tool-btn" onClick={state.refresh} disabled={loading}>
          <IconRefresh className={loading ? "spin" : ""} />
          새로고침
        </button>
      </div>

      {!note || !noteAt ? (
        <div className="tool-empty">{loading ? "불러오는 중이에요" : "아직 정보를 가져오지 못했어요."}</div>
      ) : (
        <div className="today-grid">
          <StaminaCard note={note} at={noteAt} now={now} alertAt={state.settings.alert ? state.settings.alertAt : null} />
          <div className="today-side">
            <Chores note={note} />
            <Dispatch note={note} at={noteAt} now={now} />
          </div>
          <div className="today-side">
            <Checkin state={state} />
            <Settings state={state} max={note.max_stamina} />
          </div>
        </div>
      )}
    </div>
  );
}

function StaminaCard({ note, at, now, alertAt }: { note: Note; at: number; now: number; alertAt: number | null }) {
  const cur = staminaNow(note, at, now);
  const left = secondsToFull(note, at, now);
  const ratio = Math.min(1, cur / note.max_stamina);
  const r = 82;
  const c = 2 * Math.PI * r;
  const level = ratio >= 0.93 ? "high" : ratio >= 0.7 ? "mid" : "low";
  const alertTime = alertAt ? reachAt(note, at, Math.min(alertAt, note.max_stamina), now) : null;
  const reserveMax = 2400;

  return (
    <div className="tool-card stamina-card">
      <h3>개척력</h3>
      <div className={`stamina-ring ${level}`}>
        <svg viewBox="0 0 200 200">
          <circle className="track" cx="100" cy="100" r={r} />
          <motion.circle
            className="arc"
            cx="100"
            cy="100"
            r={r}
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - ratio) }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        </svg>
        <div className="stamina-text">
          <b className="num">{cur}</b>
          <span className="num">/ {note.max_stamina}</span>
        </div>
      </div>
      <dl className="stamina-facts">
        <div>
          <dt>가득 참</dt>
          <dd>
            {left > 0 ? (
              <>
                <b className="num">{clockText(now + left * 1000)}</b>
                <small>{durationText(left)} 남음</small>
              </>
            ) : (
              <b className="full">가득 찼어요</b>
            )}
          </dd>
        </div>
        {alertAt && (
          <div>
            <dt>알림 ({alertAt})</dt>
            <dd>
              {alertTime ? <b className="num">{clockText(alertTime)}</b> : <small>이미 넘었어요</small>}
            </dd>
          </div>
        )}
        <div>
          <dt>예비 개척력</dt>
          <dd>
            <b className="num">{note.current_reserve_stamina.toLocaleString()}</b>
            <small className="num">/ {reserveMax.toLocaleString()}</small>
          </dd>
        </div>
      </dl>
      <div className="meter reserve">
        <i style={{ width: `${Math.min(100, (note.current_reserve_stamina / reserveMax) * 100)}%` }} />
      </div>
    </div>
  );
}

function Row({ label, cur, max, done, hint }: { label: string; cur: number; max: number; done?: boolean; hint?: string }) {
  const finished = done ?? cur >= max;
  return (
    <div className={`chore ${finished ? "done" : ""}`}>
      <div className="chore-head">
        <span>{label}</span>
        <span className="num">
          <b>{cur.toLocaleString()}</b> / {max.toLocaleString()}
        </span>
      </div>
      <div className="meter">
        <i style={{ width: `${max ? Math.min(100, (cur / max) * 100) : 0}%` }} />
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function Chores({ note }: { note: Note }) {
  const echoUsed = note.weekly_cocoon_limit - note.weekly_cocoon_cnt;
  return (
    <div className="tool-card" style={{ ["--glow" as string]: "rgba(143,227,196,0.35)" }}>
      <h3>할 일</h3>
      <div className="chores">
        <Row label="일일 훈련" cur={note.current_train_score} max={note.max_train_score} />
        <Row
          label="전쟁의 여운 (주간 보상)"
          cur={echoUsed}
          max={note.weekly_cocoon_limit}
          hint={note.weekly_cocoon_cnt > 0 ? `이번 주 ${note.weekly_cocoon_cnt}회 남았어요` : "이번 주 완료"}
        />
        <Row label="시뮬레이션 우주 주간 포인트" cur={note.current_rogue_score} max={note.max_rogue_score} />
        {note.rogue_tourn_weekly_unlocked && (note.rogue_tourn_weekly_max ?? 0) > 0 && (
          <Row label="차분화 우주 주간" cur={note.rogue_tourn_weekly_cur ?? 0} max={note.rogue_tourn_weekly_max ?? 0} />
        )}
      </div>
    </div>
  );
}

function Dispatch({ note, at, now }: { note: Note; at: number; now: number }) {
  return (
    <div className="tool-card" style={{ ["--glow" as string]: "rgba(110,170,255,0.3)" }}>
      <h3>
        파견 <small className="num">{note.accepted_epedition_num} / {note.total_expedition_num}</small>
      </h3>
      {note.expeditions.length === 0 ? (
        <p className="tool-note">진행 중인 파견이 없어요.</p>
      ) : (
        <ul className="dispatch">
          {note.expeditions.map((e, i) => {
            const left = Math.max(0, at + e.remaining_time * 1000 - now) / 1000;
            return (
              <li key={i}>
                {e.item_url && <img src={e.item_url} alt="" />}
                <span className="name">{e.name}</span>
                <span className={`left ${left === 0 ? "done" : ""}`}>{left === 0 ? "완료" : durationText(left)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Checkin({ state }: { state: DailyState }) {
  const { checkin, checkinError, checking } = state;
  const info = checkin?.info;
  const signed = !!info?.is_sign;
  const day = info ? (signed ? info.total_sign_day : info.total_sign_day + 1) : 0;
  const award = checkin?.awards?.[day - 1];
  return (
    <div className="tool-card checkin" style={{ ["--glow" as string]: "rgba(240,190,110,0.45)" }}>
      <h3>
        HoYoLAB 출석 {info && <small>이번 달 {info.total_sign_day}일</small>}
      </h3>
      <div className="checkin-body">
        {award && (
          <div className={`award ${signed ? "got" : ""}`}>
            <img src={award.icon} alt="" />
            <span className="num">×{award.cnt}</span>
          </div>
        )}
        <div className="checkin-text">
          <b>{!info ? "확인 중" : signed ? "오늘 출석 완료" : "아직 출석 전"}</b>
          <span>{award ? `${signed ? "오늘" : "받을"} 보상: ${award.name}` : ""}</span>
          {checkin?.captcha && <span className="warn">HoYoLAB이 보안 확인을 요청했어요. 출석 페이지에서 직접 체크해 주세요.</span>}
          {checkinError && <span className="warn">{checkinError}</span>}
        </div>
      </div>
      {!signed && (
        <div className="checkin-actions">
          {checkin?.captcha ? (
            <button className="tool-btn primary small" onClick={() => openExternal(CHECKIN_PAGE)}>
              출석 페이지 열기
            </button>
          ) : (
            <button className="tool-btn primary small" onClick={state.checkinNow} disabled={checking}>
              {checking ? "출석 중" : "지금 출석"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Settings({ state, max }: { state: DailyState; max: number }) {
  const { settings: s, setSettings } = state;
  return (
    <div className="tool-card">
      <h3>알림 · 자동</h3>
      <label className="opt" htmlFor="alert-stamina">
        <span>
          개척력 알림
          <small>
            <input
              className="num-input"
              type="number"
              min={10}
              max={max}
              value={s.alertAt}
              onChange={(e) => setSettings({ alertAt: Math.max(10, Math.min(max, Number(e.target.value) || max)) })}
            />{" "}
            이상이면 윈도우 알림
          </small>
        </span>
        <input id="alert-stamina" type="checkbox" checked={s.alert} onChange={(e) => setSettings({ alert: e.target.checked })} />
      </label>
      <label className="opt">
        <span>
          파견 완료 알림
        </span>
        <input type="checkbox" checked={s.alertDispatch} onChange={(e) => setSettings({ alertDispatch: e.target.checked })} />
      </label>
      <label className="opt">
        <span>
          출석 자동 체크
          <small>앱이 켜져 있으면 하루 한 번 자동으로 받아요</small>
        </span>
        <input type="checkbox" checked={s.autoCheckin} onChange={(e) => setSettings({ autoCheckin: e.target.checked })} />
      </label>
      <label className="opt">
        <span>
          닫으면 트레이로
          <small>창을 닫아도 알림을 받아요. 트레이 아이콘 우클릭 → 종료</small>
        </span>
        <input type="checkbox" checked={s.keepInTray} onChange={(e) => setSettings({ keepInTray: e.target.checked })} />
      </label>
    </div>
  );
}
