import { motion } from "motion/react";
import { useMemo } from "react";
import { IconRefresh } from "../components/icons";
import { monthLabel, type IncomeState } from "../lib/income";
import { JADE_PER_PULL, type WarpStore } from "../lib/warps";
import "../styles/tools.css";
import "../styles/income.css";

const COLORS = ["#f0cf86", "#8fe3c4", "#b495e8", "#7fb3e8", "#f39a6b", "#e88fb4", "#c9d17a", "#9aa3b5"];

export function IncomePage({
  state,
  warps,
  linked,
  onLink,
}: {
  state: IncomeState;
  warps: WarpStore | null;
  linked: boolean;
  onLink: () => void;
}) {
  const { data, loading, error } = state;
  const month = state.month;

  // Warps used in the shown month (from the warp history tab, if it has data)
  const used = useMemo(() => {
    if (!warps || !month) return null;
    const prefix = `${month.slice(0, 4)}-${month.slice(4, 6)}`;
    return warps.pulls.filter((p) => p.time.startsWith(prefix)).length;
  }, [warps, month]);

  if (!linked) {
    return (
      <div className="page tool-page">
        <div className="tool-empty">
          <h2>HoYoLAB 연동이 필요해요</h2>
          월간 성옥·패스 수입은 HoYoLAB의 개척 월력에서 가져와요.
          <br />
          <button className="tool-btn primary" onClick={onLink}>
            HoYoLAB 연동하기
          </button>
        </div>
      </div>
    );
  }

  const md = data?.month_data;
  const sources = [...(md?.group_by ?? [])].filter((g) => g.num > 0).sort((a, b) => b.num - a.num);
  const total = sources.reduce((t, g) => t + g.num, 0) || 1;
  const isCurrent = !!data && data.optional_month?.[0] === month;
  const pulls = md ? Math.floor(md.current_hcoin / JADE_PER_PULL) + md.current_rails_pass : 0;

  return (
    <div className="page tool-page income-page">
      <div className="tool-top">
        <div className="tseg">
          {[...(data?.optional_month ?? [])].reverse().map((m) => (
            <button key={m} className={m === month ? "on" : ""} onClick={() => state.setMonth(m)}>
              {Number(m.slice(4, 6))}월
            </button>
          ))}
        </div>
        <span className={`tool-status ${error ? "error" : ""}`} title={error ?? undefined}>
          {error ?? (loading ? "불러오는 중" : "HoYoLAB 개척 월력 기준 · 최근 몇 달만 볼 수 있어요")}
        </span>
        <button className="tool-btn" onClick={state.reload} disabled={loading}>
          <IconRefresh className={loading ? "spin" : ""} />
          새로고침
        </button>
      </div>

      {!md ? (
        <div className="tool-empty">{loading ? "불러오는 중이에요" : error ? "" : "아직 정보를 가져오지 못했어요."}</div>
      ) : (
        <>
          <div className="income-cards">
            <Total
              label="성옥"
              value={md.current_hcoin}
              last={md.last_hcoin}
              today={isCurrent ? data?.day_data?.current_hcoin : undefined}
              glow="rgba(240,190,110,0.45)"
            />
            <Total
              label="스타레일 패스"
              value={md.current_rails_pass}
              last={md.last_rails_pass}
              today={isCurrent ? data?.day_data?.current_rails_pass : undefined}
              glow="rgba(150,130,255,0.45)"
            />
            <div className="tool-card income-total" style={{ ["--glow" as string]: "rgba(143,227,196,0.35)" }}>
              <h3>워프 환산</h3>
              <div className="big">
                <b className="num">{pulls.toLocaleString()}</b>
                <span>회</span>
              </div>
              <p className="tool-note">
                성옥 {JADE_PER_PULL}개 = 1회, 패스 1장 = 1회
                {used !== null && (
                  <>
                    <br />
                    이번 달 워프 기록 <b className="num">{used.toLocaleString()}</b>회 사용
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="tool-card income-sources">
            <h3>
              {monthLabel(month)} 성옥 출처 <small>많이 받은 순</small>
            </h3>
            <div className="source-bar">
              {sources.map((g, i) => (
                <motion.i
                  key={g.action}
                  initial={{ width: 0 }}
                  animate={{ width: `${(g.num / total) * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.03 }}
                  style={{ background: COLORS[i % COLORS.length] }}
                  title={`${g.action_name} ${g.num.toLocaleString()}`}
                />
              ))}
            </div>
            <ul className="source-list">
              {sources.map((g, i) => (
                <li key={g.action}>
                  <span className="dot" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="name">{g.action_name}</span>
                  <span className="pct num">{Math.round((g.num / total) * 100)}%</span>
                  <b className="num">{g.num.toLocaleString()}</b>
                </li>
              ))}
              {sources.length === 0 && <li className="tool-note">이 달에 받은 성옥이 없어요.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function Total({ label, value, last, today, glow }: { label: string; value: number; last: number; today?: number; glow: string }) {
  const diff = value - last;
  return (
    <div className="tool-card income-total" style={{ ["--glow" as string]: glow }}>
      <h3>{label}</h3>
      <div className="big">
        <b className="num">{value.toLocaleString()}</b>
      </div>
      <p className="tool-note">
        지난달 <span className="num">{last.toLocaleString()}</span>
        {last > 0 && (
          <span className={`delta num ${diff >= 0 ? "up" : "down"}`}>
            {diff >= 0 ? "▲" : "▼"} {Math.abs(diff).toLocaleString()}
          </span>
        )}
        {today !== undefined && (
          <>
            <br />
            오늘 <span className="num">{today.toLocaleString()}</span>
          </>
        )}
      </p>
    </div>
  );
}
