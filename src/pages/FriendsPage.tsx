import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { IconClose, IconFriends } from "../components/icons";
import { asset, ELEMENT_COLORS, game } from "../data/game";
import {
  addFriendUid,
  fetchProfiles,
  getFriendUids,
  getLastPublished,
  getShareEnabled,
  isFriendsConfigured,
  isValidUid,
  publishProfile,
  removeFriendUid,
  setShareEnabled,
  timeAgo,
  unpublishProfile,
} from "../lib/friends";
import type { Account } from "../types";
import { CharacterPage } from "./CharacterPage";
import { ChallengeSummary, EndgamePage } from "./EndgamePage";
import { RosterPage } from "./RosterPage";
import "../styles/friends.css";

type View =
  | { kind: "list" }
  | { kind: "roster"; uid: string }
  | { kind: "endgame"; uid: string }
  | { kind: "character"; uid: string; charId: string };

export function FriendsPage({ myAccount }: { myAccount: Account }) {
  const [view, setView] = useState<View>({ kind: "list" });
  const [uids, setUids] = useState<string[]>(getFriendUids);
  const [profiles, setProfiles] = useState<Record<string, Account>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (list: string[]) => {
    if (!isFriendsConfigured() || list.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      setProfiles(await fetchProfiles(list));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(uids);
    // only on first open; later refreshes are explicit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isFriendsConfigured()) return <NotConfigured />;

  const friend = view.kind !== "list" ? profiles[view.uid] : undefined;

  if (view.kind === "roster" && friend) {
    return (
      <div className="page">
        <RosterPage
          characters={friend.characters}
          onOpen={(charId) => setView({ kind: "character", uid: friend.uid, charId })}
        />
        <FriendBar label={`${friend.nickname}의 캐릭터`} back="친구 목록" onBack={() => setView({ kind: "list" })} />
      </div>
    );
  }

  if (view.kind === "endgame" && friend) {
    return (
      <div className="page">
        <EndgamePage account={friend} title={`${friend.nickname}의 기록`} />
        <FriendBar label={`${friend.nickname}의 엔드 컨텐츠`} back="친구 목록" onBack={() => setView({ kind: "list" })} />
      </div>
    );
  }

  if (view.kind === "character" && friend) {
    const character = friend.characters.find((c) => c.id === view.charId) ?? friend.characters[0];
    const element = game.characters[character.id]?.element;
    return (
      <div className="page" style={{ "--element": element ? ELEMENT_COLORS[element] : undefined } as CSSProperties}>
        <CharacterPage character={character} />
        <FriendBar
          label={`${friend.nickname}의 ${game.characters[character.id]?.name ?? "캐릭터"}`}
          back="캐릭터 목록"
          onBack={() => setView({ kind: "roster", uid: friend.uid })}
        />
      </div>
    );
  }

  const add = async (uid: string): Promise<string | null> => {
    const id = uid.trim();
    if (!isValidUid(id)) return "UID는 9~10자리 숫자예요.";
    if (id === myAccount.uid) return "내 UID는 추가할 수 없어요.";
    if (uids.includes(id)) return "이미 추가한 친구예요.";
    const next = addFriendUid(id);
    setUids(next);
    await refresh(next);
    return null;
  };

  const remove = (uid: string) => {
    setUids(removeFriendUid(uid));
    setProfiles((p) => {
      const { [uid]: _gone, ...rest } = p;
      return rest;
    });
  };

  return (
    <div className="page friends-page">
      <section className="friends-main">
        <div className="friends-toolbar">
          <AddFriend onAdd={add} />
          <button className="pill-btn ghost small" onClick={() => refresh(uids)} disabled={loading || !uids.length}>
            {loading ? "불러오는 중…" : "새로고침"}
          </button>
        </div>
        {error && <div className="friends-error">{error}</div>}

        {uids.length === 0 ? (
          <div className="friends-empty">
            <IconFriends />
            <p>
              친구의 UID를 추가하면 친구가 공개한 캐릭터와 성유물 세팅을 볼 수 있어요.
              <br />
              친구도 이 앱에서 <b>내 캐릭터 친구에게 공개</b>를 켜야 보여요.
            </p>
          </div>
        ) : (
          <div className="friend-grid">
            <AnimatePresence>
              {uids.map((uid, i) => (
                <FriendCard
                  key={uid}
                  uid={uid}
                  profile={profiles[uid]}
                  loading={loading}
                  delay={i * 0.04}
                  onOpen={() => profiles[uid] && setView({ kind: "roster", uid })}
                  onOpenEndgame={() => profiles[uid] && setView({ kind: "endgame", uid })}
                  onRemove={() => remove(uid)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      <MySharePanel account={myAccount} />
    </div>
  );
}

function FriendBar({ label, back, onBack }: { label: string; back: string; onBack: () => void }) {
  return (
    <motion.div className="friend-bar" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
      <button className="friend-back" onClick={onBack}>
        ← {back}
      </button>
      <span>{label}</span>
    </motion.div>
  );
}

function AddFriend({ onAdd }: { onAdd: (uid: string) => Promise<string | null> }) {
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const err = await onAdd(value);
    setBusy(false);
    setMsg(err);
    if (!err) setValue("");
  };

  return (
    <div className="add-friend">
      <input
        className="num"
        value={value}
        inputMode="numeric"
        maxLength={10}
        placeholder="친구 UID 입력"
        onChange={(e) => {
          setValue(e.target.value.replace(/\D/g, ""));
          setMsg(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <button className="pill-btn small" onClick={submit} disabled={busy || !value}>
        친구 추가
      </button>
      {msg && <span className="add-msg">{msg}</span>}
    </div>
  );
}

function FriendCard({
  uid,
  profile,
  loading,
  delay,
  onOpen,
  onOpenEndgame,
  onRemove,
}: {
  uid: string;
  profile?: Account;
  loading: boolean;
  delay: number;
  onOpen: () => void;
  onOpenEndgame: () => void;
  onRemove: () => void;
}) {
  const top = profile
    ? [...profile.characters]
        .sort((a, b) => (game.characters[b.id]?.rarity ?? 0) - (game.characters[a.id]?.rarity ?? 0) || b.level - a.level)
        .slice(0, 5)
    : [];

  return (
    <motion.div
      layout
      className={`friend-card ${profile ? "" : "pending"}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: { delay } }}
      exit={{ opacity: 0, scale: 0.96 }}
      onClick={onOpen}
    >
      <button
        className="friend-remove"
        title="친구 삭제"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <IconClose />
      </button>

      <div className="friend-head">
        <img src={asset(`icon/avatar/${profile?.avatarId ?? "8001"}.png`)} alt="" />
        <div>
          <div className="friend-name">{profile?.nickname ?? (loading ? "불러오는 중…" : "공개 정보 없음")}</div>
          <div className="friend-meta num">
            UID {uid}
            {profile && ` · 개척 레벨 ${profile.level}`}
          </div>
        </div>
      </div>

      {profile ? (
        <>
          <div className="friend-avatars">
            {top.map((c) => (
              <img key={c.id} src={asset(`icon/avatar/${c.id}.png`)} alt={game.characters[c.id]?.name} />
            ))}
          </div>
          {profile.challenges && (
            <button
              className="friend-endgame"
              title="엔드 컨텐츠 기록 보기"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEndgame();
              }}
            >
              <ChallengeSummary account={profile} />
              <span className="friend-endgame-go">기록 보기 ›</span>
            </button>
          )}
          <div className="friend-foot">
            <span>
              캐릭터 <b className="num">{profile.characters.length}</b>
            </span>
            <span>{timeAgo(profile.updatedAt)} 동기화</span>
          </div>
        </>
      ) : (
        <p className="friend-pending">
          {loading ? " " : "친구가 아직 캐릭터를 공개하지 않았어요. 친구가 공개를 켜면 여기에 보여요."}
        </p>
      )}
    </motion.div>
  );
}

function MySharePanel({ account }: { account: Account }) {
  const [enabled, setEnabled] = useState(getShareEnabled);
  const [last, setLast] = useState(getLastPublished);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const linked = account.source === "hoyolab";

  const publish = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await publishProfile(account);
      setLast(getLastPublished());
      setMsg({ ok: true, text: "공개했어요. 친구가 새로고침하면 보여요." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    const next = !enabled;
    setShareEnabled(next);
    setEnabled(next);
    if (next) {
      await publish();
    } else {
      setBusy(true);
      try {
        await unpublishProfile(account.uid);
        setLast(null);
        setMsg({ ok: true, text: "공개를 껐어요. 친구 목록에서 내 정보가 사라져요." });
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      } finally {
        setBusy(false);
      }
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account.uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the UID is still visible to copy by hand */
    }
  };

  return (
    <aside className="share-panel">
      <h3 className="section-title">내 공유 상태</h3>

      <div className="share-uid">
        <span>내 UID</span>
        <b className="num">{account.uid}</b>
        <button className="pill-btn ghost small" onClick={copy}>
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <p className="share-hint">친구에게 이 UID를 알려주면 친구 목록에 추가할 수 있어요.</p>

      <button className={`share-toggle ${enabled ? "on" : ""}`} onClick={toggle} disabled={!linked || busy}>
        <span className="switch">
          <i />
        </span>
        <span>내 캐릭터 친구에게 공개</span>
      </button>

      {!linked ? (
        <p className="share-note">HoYoLAB 연동 후에 공개할 수 있어요. 샘플 데이터는 공개되지 않아요.</p>
      ) : (
        <>
          <div className="share-row">
            <span>마지막 공개</span>
            <b>{enabled ? timeAgo(last) : "꺼짐"}</b>
          </div>
          <button className="pill-btn share-publish" onClick={publish} disabled={!enabled || busy}>
            {busy ? "처리 중…" : "지금 공개/갱신"}
          </button>
          <p className="share-note">공개되는 건 캐릭터, 광추, 성유물 정보뿐이에요. 로그인 정보는 이 PC 밖으로 나가지 않아요.</p>
        </>
      )}

      {msg && <p className={`share-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
    </aside>
  );
}

function NotConfigured() {
  return (
    <div className="page friends-page center">
      <motion.div className="friends-setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="setup-emblem">
          <IconFriends />
        </div>
        <h2>친구 기능 준비 중</h2>
        <p>
          친구끼리 캐릭터를 보려면 공유 서버(Supabase) 설정이 필요해요.
          <br />
          앱을 만든 사람이 한 번만 설정하면, 이후 배포되는 앱에서는 바로 쓸 수 있어요.
        </p>
        <span className="setup-doc">설정 방법: docs/FRIENDS_SETUP.md</span>
      </motion.div>
    </div>
  );
}
