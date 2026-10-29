// Friend sharing: publish my game data (never login cookies) and read friends' data by UID.
import type { Account, ChallengeRecords, OwnedCharacter } from "../types";
import { ensureSession, getSupabase, supabaseConfigured } from "./supabase";

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

export function isFriendsConfigured(): boolean {
  return supabaseConfigured;
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

// ---------- Server ----------

interface ProfileRow {
  uid: string;
  nickname: string | null;
  level: number | null;
  avatar_id: string | null;
  signature: string | null;
  characters: unknown;
  challenges?: unknown;
  updated_at: string;
}

function toAccount(row: ProfileRow): Account {
  return {
    uid: row.uid,
    nickname: row.nickname ?? "개척자",
    level: row.level ?? 0,
    avatarId: row.avatar_id ?? "8001",
    signature: row.signature ?? "",
    characters: Array.isArray(row.characters) ? (row.characters as OwnedCharacter[]) : [],
    updatedAt: row.updated_at,
    source: "hoyolab",
    challenges: (row.challenges as ChallengeRecords | null) ?? undefined,
  };
}

/**
 * Uploads my account so friends can see it. Does nothing unless sharing is configured,
 * switched on, and the data comes from HoYoLAB (sample data is never published).
 */
export async function publishProfile(account: Account): Promise<void> {
  const sb = getSupabase();
  if (!sb || !getShareEnabled() || account.source !== "hoyolab") return;
  await ensureSession(sb);

  const { error } = await sb.from("profiles").upsert(
    {
      uid: account.uid,
      nickname: account.nickname,
      level: account.level,
      avatar_id: account.avatarId,
      signature: account.signature,
      characters: account.characters,
      challenges: account.challenges ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "uid" },
  );
  if (error) {
    // RLS rejects updates to a UID that another install published first
    if (error.code === "42501" || /row-level security/i.test(error.message)) {
      throw new Error("이 UID는 다른 기기에서 이미 공개했어요. 처음 공개한 PC에서 공개를 꺼 주세요.");
    }
    throw new Error(`공개하지 못했어요: ${error.message}`);
  }
  write(KEY_PUBLISHED, new Date().toISOString());
}

/** Removes my published data (used when sharing is switched off). */
export async function unpublishProfile(uid: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await ensureSession(sb);
  const { error } = await sb.from("profiles").delete().eq("uid", uid);
  if (error) throw new Error(`공개를 해제하지 못했어요: ${error.message}`);
  write(KEY_PUBLISHED, null);
}

export async function fetchProfile(uid: string): Promise<Account | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from("profiles").select("*").eq("uid", uid.trim()).maybeSingle();
  if (error) throw new Error(`친구 정보를 불러오지 못했어요: ${error.message}`);
  return data ? toAccount(data as ProfileRow) : null;
}

/** Loads several friends at once. UIDs that never published are simply missing from the map. */
export async function fetchProfiles(uids: string[]): Promise<Record<string, Account>> {
  const sb = getSupabase();
  if (!sb || uids.length === 0) return {};
  const { data, error } = await sb.from("profiles").select("*").in("uid", uids);
  if (error) throw new Error(`친구 정보를 불러오지 못했어요: ${error.message}`);
  return Object.fromEntries((data as ProfileRow[]).map((r) => [r.uid, toAccount(r)]));
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
