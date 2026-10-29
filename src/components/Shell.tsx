import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { asset, game } from "../data/game";
import type { Account } from "../types";
import { IconChevron, IconClose, IconMaximize, IconMinimize } from "./icons";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function win() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export function WindowControls() {
  if (!isTauri) return null;
  return (
    <div className="window-controls">
      <button title="최소화" onClick={async () => (await win()).minimize()}>
        <IconMinimize />
      </button>
      <button title="최대화" onClick={async () => (await win()).toggleMaximize()}>
        <IconMaximize />
      </button>
      <button className="close" title="닫기" onClick={async () => (await win()).close()}>
        <IconClose />
      </button>
    </div>
  );
}

export function Backdrop() {
  return (
    <div className="backdrop">
      <div className="stars" />
      <svg className="orbit" viewBox="0 0 1000 1000" fill="none">
        <circle cx="500" cy="500" r="480" stroke="rgba(255,255,255,0.07)" />
        <circle cx="500" cy="500" r="400" stroke="rgba(220,188,124,0.14)" strokeDasharray="2 10" />
        <circle cx="500" cy="500" r="330" stroke="rgba(255,255,255,0.06)" />
        <circle cx="500" cy="500" r="250" stroke="rgba(255,255,255,0.05)" strokeDasharray="60 14" />
        <circle cx="500" cy="20" r="5" fill="rgba(220,188,124,0.55)" />
        <circle cx="900" cy="500" r="3" fill="rgba(255,255,255,0.5)" />
        <circle cx="170" cy="330" r="2.5" fill="rgba(255,255,255,0.4)" />
        <path d="M500 0v40M500 960v40M0 500h40M960 500h40" stroke="rgba(255,255,255,0.15)" />
      </svg>
      <div className="floor" />
    </div>
  );
}

export interface RailEntry {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: string;
}

export function SideRail({
  items,
  active,
  onSelect,
  footer,
}: {
  items: (RailEntry | "divider")[];
  active: string;
  onSelect: (id: string) => void;
  footer?: ReactNode;
}) {
  return (
    <nav className="rail">
      {items.map((it, i) =>
        it === "divider" ? (
          <div key={`d${i}`} className="rail-divider" />
        ) : (
          <button
            key={it.id}
            className={`rail-item ${active === it.id ? "active" : ""}`}
            onClick={() => onSelect(it.id)}
          >
            <span className="rail-dot">{it.icon}</span>
            {it.badge && <span className="rail-badge">{it.badge}</span>}
            <span className="rail-label">{it.label}</span>
          </button>
        ),
      )}
      <div className="rail-spacer" />
      {footer}
    </nav>
  );
}

export function TopBar({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <header className="topbar" data-tauri-drag-region>
      <div className="title-block">
        <div className="title-emblem">{icon}</div>
        <div className="title-text">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="topbar-drag" data-tauri-drag-region />
      {children}
      <WindowControls />
    </header>
  );
}

// Carousel geometry: chip size + gap, and how many chips fit in the window.
const CHIP = 48;
const STEP = 60;
const VISIBLE = 9;

export function AvatarStrip({
  ids,
  active,
  onSelect,
}: {
  ids: string[];
  active: string;
  onSelect: (id: string) => void;
}) {
  const idx = Math.max(0, ids.indexOf(active));
  const lastWheel = useRef(0);
  const width = VISIBLE * STEP;

  const go = (delta: number) => {
    const next = Math.min(ids.length - 1, Math.max(0, idx + delta));
    if (next !== idx) onSelect(ids[next]);
  };

  // Preload neighbours so the illustration is ready before it is selected.
  useEffect(() => {
    for (const d of [-1, 1]) {
      const id = ids[idx + d];
      if (id) preload(asset(game.characters[id].portrait));
    }
  }, [idx, ids]);

  return (
    <div className="avatar-carousel">
      <button className="carousel-arrow" disabled={idx === 0} onClick={() => go(-1)} title="이전 캐릭터 (←)">
        <IconChevron style={{ rotate: "180deg" }} />
      </button>
      <div
        className="carousel-viewport"
        style={{ width }}
        onWheel={(e) => {
          // Smooth-scrolling wheels and touchpads fire a burst of events per tick.
          // Move one character per burst: ignore events until the wheel has been quiet briefly.
          const now = Date.now();
          const quiet = now - lastWheel.current > 180;
          lastWheel.current = now;
          if (quiet) go((e.deltaY || e.deltaX) > 0 ? 1 : -1);
        }}
      >
        <motion.div
          className="carousel-track"
          initial={false}
          animate={{ x: width / 2 - (idx * STEP + CHIP / 2) }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
        >
          {ids.map((id, i) => {
            const c = game.characters[id];
            const dist = Math.abs(i - idx);
            return (
              <motion.button
                key={id}
                className={`avatar-chip r${c.rarity} ${i === idx ? "active" : ""}`}
                style={{ left: i * STEP }}
                title={c.name}
                onClick={() => onSelect(id)}
                onMouseEnter={() => preload(asset(c.portrait))}
                initial={false}
                animate={{ scale: i === idx ? 1.18 : 1, opacity: Math.max(0.35, 1 - dist * 0.13) }}
                whileHover={{ opacity: 1, y: -2 }}
                transition={{ type: "spring", stiffness: 300, damping: 26 }}
              >
                <img src={asset(`icon/avatar/${id}.png`)} alt={c.name} />
              </motion.button>
            );
          })}
        </motion.div>
      </div>
      <button
        className="carousel-arrow"
        disabled={idx === ids.length - 1}
        onClick={() => go(1)}
        title="다음 캐릭터 (→)"
      >
        <IconChevron />
      </button>
      <span className="carousel-count num">
        {idx + 1} / {ids.length}
      </span>
    </div>
  );
}

export function AccountCard({ account, demo, extra }: { account: Account; demo: boolean; extra?: ReactNode }) {
  return (
    <div className="account-chip">
      <img src={asset(`icon/avatar/${account.avatarId}.png`)} alt="" />
      {demo && <span className="demo-dot">샘플</span>}
      <div className="account-pop">
        <div className="name">{account.nickname}</div>
        <div className="meta num">
          UID {account.uid} · 개척 레벨 {account.level}
        </div>
        {extra && <div className="meta">{extra}</div>}
      </div>
    </div>
  );
}

const preloaded = new Set<string>();
export function preload(src: string) {
  if (preloaded.has(src)) return;
  preloaded.add(src);
  const img = new Image();
  img.src = src;
}
