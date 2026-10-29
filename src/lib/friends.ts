// Friend sharing: publish my game data (never login cookies) and read friends' data by UID.
import type { Account, ChallengeRecords, OwnedCharacter } from "../types";
import { api } from "./server";

const KEY_SHARE = "sra.friends.share";
const KEY_FRIENDS = "sra.friends.uids";
const KEY_PUBLISHED = "sra.friends.lastPublished";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}

/** The friend server lives on the host PC, so the feature is always available (it may be offline). */
export function isFriendsConfigured(): boolean {
  return true;
}

export function isValidUid(uid: string): boolean {
  return /^\d{9,10}$/.test(uid.trim());
}

// ---------- Share toggle ----------

export function getShareEnabled(): boolean {
  return read(KEY_SHARE) === "1";
}

export function setShareEnabled(v: boolean): void {
  write(KEY_SHARE, v ? "1" : "0");
}

/** ISO time of my last successful publish, if any. */
export function getLastPublished(): string | null {
  return read(KEY_PUBLISHED);
}

// ---------- Friend list (local) ----------

export function getFriendUids(): string[] {
  try {
    const list = JSON.parse(read(KEY_FRIENDS) ?? "[]");
    return Array.isArray(list) ? list.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}

export function addFriendUid(uid: string): string[] {
  const id = uid.trim();
  const list = getFriendUids();
  if (!list.includes(id)) list.push(id);
  write(KEY_FRIENDS, JSON.stringify(list));
  return list;
}

export function removeFriendUid(uid: string): string[] {
  const list = getFriendUids().filter((u) => u !== uid);
  write(KEY_FRIENDS, JSON.stringify(list));
  return list;
}

// ---------- Server (host PC, see server/index.mjs) ----------

const KEY_CACHE = "sra.friends.cache";

interface ProfileDoc {
  uid: string;
  nickname?: string;
  level?: number;
  avatarId?: string;
  signature?: string;
  characters?: unknown;
  challenges?: unknown;
  updatedAt: string;
}

function toAccount(d: ProfileDoc): Account {
  return {
    uid: d.uid,
    nickname: d.nickname || "개척자",
    level: d.level ?? 0,
    avatarId: d.avatarId ?? "8001",
    signature: d.signature ?? "",
    characters: Array.isArray(d.characters) ? (d.characters as OwnedCharacter[]) : [],
    updatedAt: d.updatedAt,
    source: "hoyolab",
    challenges: (d.challenges as ChallengeRecords | null) ?? undefined,
  };
}

function friendlyError(e: unknown, action: string): Error {
  const err = e as Error & { status?: number };
  if (err.status === 403) return new Error("이 UID는 다른 기기에서 이미 공개했어요. 처음 공개한 PC에서 공개를 꺼 주세요.");
  if (err.status === 429) return new Error("요청이 너무 많아요. 잠시 후 다시 시도해 주세요.");
  return new Error(err.status ? `${action}: ${err.message}` : err.message);
}

/**
 * Uploads my account so friends can see it. Does nothing unless sharing is switched on
 * and the data comes from HoYoLAB (sample data is never published).
 */
export async function publishProfile(account: Account): Promise<void> {
  if (!getShareEnabled() || account.source !== "hoyolab") return;
  try {
    await api(`/api/profiles/${account.uid}`, {
      method: "PUT",
      secret: true,
      body: JSON.stringify({
        nickname: account.nickname,
        level: account.level,
        avatarId: account.avatarId,
        signature: account.signature,
        characters: account.characters,
        challenges: account.challenges ?? null,
      }),
    });
  } catch (e) {
    throw friendlyError(e, "공개하지 못했어요");
  }
  write(KEY_PUBLISHED, new Date().toISOString());
}

/** Removes my published data (used when sharing is switched off). */
export async function unpublishProfile(uid: string): Promise<void> {
  try {
    await api(`/api/profiles/${uid}`, { method: "DELETE", secret: true });
  } catch (e) {
    throw friendlyError(e, "공개를 해제하지 못했어요");
  }
  write(KEY_PUBLISHED, null);
}

function readCache(): Record<string, ProfileDoc> {
  try {
    return JSON.parse(read(KEY_CACHE) ?? "{}");
  } catch {
    return {};
  }
}

export async function fetchProfile(uid: string): Promise<Account | null> {
  return (await fetchProfiles([uid.trim()]))[uid.trim()] ?? null;
}

/**
 * Loads several friends at once. UIDs that never published are missing from the map.
 * When the server is offline, the last downloaded copies are returned (and the error is rethrown
 * only if there is nothing cached).
 */
export async function fetchProfiles(uids: string[]): Promise<Record<string, Account>> {
  if (uids.length === 0) return {};
  const cache = readCache();
  try {
    const { profiles } = await api<{ profiles: Record<string, ProfileDoc> }>(`/api/profiles?uids=${uids.join(",")}`);
    const next = { ...cache, ...profiles };
    write(KEY_CACHE, JSON.stringify(next));
    return Object.fromEntries(Object.entries(profiles).map(([u, d]) => [u, toAccount(d)]));
  } catch (e) {
    const cached = Object.fromEntries(uids.filter((u) => cache[u]).map((u) => [u, toAccount(cache[u])]));
    if (Object.keys(cached).length) return cached;
    throw friendlyError(e, "친구 정보를 불러오지 못했어요");
  }
}

/** "방금 전", "5분 전", "3시간 전", "2일 전" */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "기록 없음";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}
