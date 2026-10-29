import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AccountCard, AvatarStrip, Backdrop, SideRail, TopBar, type RailEntry } from "./components/Shell";
import { UpdateBanner } from "./components/UpdateBanner";
import {
  IconCharacter,
  IconFarm,
  IconFriends,
  IconIncome,
  IconLink,
  IconPlanner,
  IconRefresh,
  IconRelic,
  IconRoster,
  IconSpeed,
  IconToday,
  IconTrophy,
  IconWarp,
} from "./components/icons";
import { ELEMENT_COLORS, game } from "./data/game";
import { staminaNow, useDaily } from "./lib/daily";
import { timeAgo } from "./lib/hoyolab";
import { useIncome } from "./lib/income";
import { useAccount, type AccountState } from "./lib/useAccount";
import { useWarps } from "./lib/warps";
import { AuditPage } from "./pages/AuditPage";
import { EndgamePage } from "./pages/EndgamePage";
import { CharacterPage } from "./pages/CharacterPage";
import { FarmPage } from "./pages/FarmPage";
import { FriendsPage } from "./pages/FriendsPage";
import { IncomePage } from "./pages/IncomePage";
import { LinkPage } from "./pages/InfoPages";
import { PlannerPage } from "./pages/PlannerPage";
import { RosterPage } from "./pages/RosterPage";
import { TeamSimPage } from "./pages/TeamSimPage";
import { TodayPage } from "./pages/TodayPage";
import { WarpPage } from "./pages/WarpPage";

type Tab =
  | "character"
  | "roster"
  | "today"
  | "audit"
  | "farm"
  | "planner"
  | "teamsim"
  | "endgame"
  | "warp"
  | "income"
  | "friends"
  | "link";

const TABS: Record<Tab, { label: string; sub: string; icon: ReactNode }> = {
  character: { label: "캐릭터", sub: "CHARACTER", icon: <IconCharacter /> },
  roster: { label: "보유 캐릭터", sub: "ROSTER", icon: <IconRoster /> },
  today: { label: "오늘", sub: "DAILY NOTE", icon: <IconToday /> },
  audit: { label: "세팅 점검", sub: "BUILD CHECK", icon: <IconRelic /> },
  farm: { label: "파밍 추천", sub: "FARMING GUIDE", icon: <IconFarm /> },
  planner: { label: "육성 계산", sub: "PLANNER", icon: <IconPlanner /> },
  teamsim: { label: "파티 속도 시뮬", sub: "TEAM SPEED", icon: <IconSpeed /> },
  endgame: { label: "엔드 컨텐츠", sub: "END GAME", icon: <IconTrophy /> },
  warp: { label: "워프 기록", sub: "WARP RECORDS", icon: <IconWarp /> },
  income: { label: "월간 수입", sub: "MONTHLY INCOME", icon: <IconIncome /> },
  friends: { label: "친구", sub: "FRIENDS", icon: <IconFriends /> },
  link: { label: "HoYoLAB 연동", sub: "ACCOUNT LINK", icon: <IconLink /> },
};

function SyncChip({ state, onOpenLink }: { state: AccountState; onOpenLink: () => void }) {
  if (!state.linked) return null;
  const { syncing, error, account } = state;
  return (
    <button
      className={`sync-chip ${syncing ? "spinning" : ""} ${error ? "error" : ""}`}
      onClick={error ? onOpenLink : state.sync}
      disabled={syncing}
      title={error ?? "지금 동기화"}
    >
      <IconRefresh />
      <span>{syncing ? "동기화 중" : error ? "동기화 실패" : timeAgo(account.updatedAt)}</span>
    </button>
  );
}

export default function App() {
  const state = useAccount();
  const [tab, setTab] = useState<Tab>("character");
  const warps = useWarps();
  const daily = useDaily(state.linked);
  const income = useIncome(tab === "income" ? state.linked : null);
  const { demo } = state;
  // Characters newer than the game data (until the next data refresh) are hidden instead of breaking the UI.
  const account = useMemo(
    () => ({ ...state.account, characters: state.account.characters.filter((c) => game.characters[c.id]) }),
    [state.account],
  );
  const [charId, setCharId] = useState(account.characters[0]?.id ?? "");

  const character = account.characters.find((c) => c.id === charId) ?? account.characters[0];
  const element = character ? game.characters[character.id]?.element : undefined;

  // Opening the warp tab picks up history the game cached since the last check
  const warpSync = warps.sync;
  useEffect(() => {
    if (tab === "warp") warpSync({ quiet: true });
  }, [tab, warpSync]);

  // ← → switch characters on the character screen
  useEffect(() => {
    if (tab !== "character") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const ids = account.characters.map((c) => c.id);
      const i = ids.indexOf(character?.id ?? "") + (e.key === "ArrowRight" ? 1 : -1);
      if (i >= 0 && i < ids.length) setCharId(ids[i]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, character, account.characters]);

  // Rail badge: Trailblaze Power close to full
  const todayBadge =
    daily.note && daily.noteAt && staminaNow(daily.note, daily.noteAt, daily.now) >= daily.note.max_stamina - 20
      ? "!"
      : undefined;

  const rail: (RailEntry | "divider")[] = [
    { id: "character", label: TABS.character.label, icon: TABS.character.icon },
    { id: "roster", label: TABS.roster.label, icon: TABS.roster.icon },
    { id: "today", label: TABS.today.label, icon: TABS.today.icon, badge: todayBadge },
    "divider",
    { id: "audit", label: TABS.audit.label, icon: TABS.audit.icon },
    { id: "farm", label: TABS.farm.label, icon: TABS.farm.icon },
    { id: "planner", label: TABS.planner.label, icon: TABS.planner.icon },
    { id: "teamsim", label: TABS.teamsim.label, icon: TABS.teamsim.icon },
    { id: "endgame", label: TABS.endgame.label, icon: TABS.endgame.icon },
    "divider",
    { id: "warp", label: TABS.warp.label, icon: TABS.warp.icon },
    { id: "income", label: TABS.income.label, icon: TABS.income.icon },
    "divider",
    { id: "friends", label: TABS.friends.label, icon: TABS.friends.icon },
    { id: "link", label: TABS.link.label, icon: TABS.link.icon, badge: demo ? "!" : undefined },
  ];

  const open = (id: string) => {
    setCharId(id);
    setTab("character");
  };

  return (
    <div
      className="app"
      style={{ "--element": element ? ELEMENT_COLORS[element] : "#7b6cf0" } as CSSProperties}
    >
      <Backdrop />

      <TopBar icon={TABS[tab].icon} title={TABS[tab].label} subtitle={TABS[tab].sub}>
        {tab === "character" && character && (
          <AvatarStrip ids={account.characters.map((c) => c.id)} active={character.id} onSelect={setCharId} />
        )}
        <SyncChip state={state} onOpenLink={() => setTab("link")} />
      </TopBar>

      <SideRail
        items={rail}
        active={tab}
        onSelect={(id) => setTab(id as Tab)}
        footer={
          <AccountCard
            account={account}
            demo={demo}
            extra={demo ? "샘플 데이터" : `${timeAgo(account.updatedAt)} 동기화`}
          />
        }
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          className="page"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {tab === "character" &&
            (character ? (
              <CharacterPage character={character} />
            ) : (
              <EmptyRoster onLink={() => setTab("link")} />
            ))}
          {tab === "roster" && <RosterPage characters={account.characters} onOpen={open} allowExclude />}
          {tab === "audit" && <AuditPage account={account} onOpenCharacter={open} />}
          {tab === "farm" && <FarmPage account={account} onOpenCharacter={open} />}
          {tab === "endgame" && <EndgamePage account={account} />}
          {tab === "today" && <TodayPage state={daily} linked={!!state.linked} onLink={() => setTab("link")} />}
          {tab === "planner" && <PlannerPage linked={!!state.linked} onLink={() => setTab("link")} />}
          {tab === "teamsim" && <TeamSimPage account={account} />}
          {tab === "warp" && <WarpPage state={warps} />}
          {tab === "income" && (
            <IncomePage state={income} warps={warps.data} linked={!!state.linked} onLink={() => setTab("link")} />
          )}
          {tab === "friends" && <FriendsPage myAccount={account} />}
          {tab === "link" && <LinkPage state={state} />}
        </motion.div>
      </AnimatePresence>

      <UpdateBanner />
    </div>
  );
}

function EmptyRoster({ onLink }: { onLink: () => void }) {
  return (
    <div className="page info-page">
      <div className="info-card">
        <h2>캐릭터가 없어요</h2>
        <button className="pill-btn" onClick={onLink}>
          HoYoLAB 연동 확인
        </button>
      </div>
    </div>
  );
}
