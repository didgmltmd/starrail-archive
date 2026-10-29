import { motion } from "motion/react";
import { useState } from "react";
import { IconLink } from "../components/icons";
import { asset } from "../data/game";
import { timeAgo } from "../lib/hoyolab";
import type { AccountState } from "../lib/useAccount";
import "../styles/info.css";

export function LinkPage({ state }: { state: AccountState }) {
  const { account, demo, linked, syncing, loggingIn, error, warning, canLink } = state;
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  return (
    <div className="page info-page">
      <motion.div
        className="info-card link-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="info-emblem">
          <IconLink />
        </div>
        <h2>HoYoLAB 연동</h2>
        <p className="info-lead">
          HoYoLAB에 한 번 로그인하면 보유한 캐릭터 전체와 장착 중인 광추, 성유물을 불러와요.
          <br />
          로그인 정보는 이 PC의 Windows 자격 증명에만 저장되고, HoYoLAB 말고는 아무 데도 보내지 않아요.
        </p>

        <div className="link-status">
          <img src={asset(`icon/avatar/${account.avatarId}.png`)} alt="" />
          <div>
            <b>{linked && !demo ? account.nickname : linked ? "연동됨" : "연동 안 됨"}</b>
            <span>
              {linked && !demo
                ? `UID ${account.uid} · 개척 레벨 ${account.level} · ${account.characters.length}명`
                : linked
                  ? "데이터를 불러오는 중이에요"
                  : "지금은 샘플 데이터를 보여주고 있어요"}
            </span>
          </div>
          {linked && !demo && (
            <span className="link-sync num">
              {syncing ? "동기화 중…" : `${timeAgo(account.updatedAt)} 동기화`}
            </span>
          )}
        </div>

        {error && <div className="link-msg error">{error}</div>}
        {!error && warning && <div className="link-msg warn">{warning}</div>}

        {!canLink ? (
          <>
            <button className="pill-btn" disabled>
              HoYoLAB 연동하기
            </button>
            <span className="info-note">연동은 설치한 앱에서만 할 수 있어요 (브라우저 미리보기에서는 불가)</span>
          </>
        ) : !linked ? (
          <>
            <button className="pill-btn" onClick={state.link} disabled={loggingIn}>
              {loggingIn ? "로그인 창에서 로그인해 주세요…" : "HoYoLAB 연동하기"}
            </button>
            <span className="info-note">새 창에서 HoYoLAB에 로그인하면 창이 자동으로 닫히고 데이터를 불러와요</span>
          </>
        ) : (
          <>
            <div className="link-actions">
              <button className="pill-btn" onClick={state.sync} disabled={syncing}>
                {syncing ? "동기화 중…" : "지금 동기화"}
              </button>
              {confirmUnlink ? (
                <button className="pill-btn ghost danger" onClick={() => state.unlink().then(() => setConfirmUnlink(false))}>
                  정말 해제할게요
                </button>
              ) : (
                <button className="pill-btn ghost" onClick={() => setConfirmUnlink(true)}>
                  연동 해제
                </button>
              )}
            </div>
            <span className="info-note">
              앱을 켤 때(마지막 동기화 30분 이후) 그리고 켜 둔 동안 1시간마다 자동으로 동기화해요
            </span>
          </>
        )}

        <details className="link-help">
          <summary>데이터가 안 보이거나 오래된 것 같아요</summary>
          <ul>
            <li>HoYoLAB 앱 &gt; 전적 &gt; 설정에서 &apos;캐릭터 상세 정보&apos;를 공개로 켜 주세요.</li>
            <li>게임에서 바꾼 세팅은 HoYoLAB에 반영되기까지 시간이 걸릴 수 있어요. 게임을 껐다 켜거나 잠시 뒤 다시 동기화해 보세요.</li>
            <li>HoYoLAB 로그인이 만료되면 다시 연동하라는 안내가 떠요.</li>
          </ul>
        </details>
      </motion.div>
    </div>
  );
}
