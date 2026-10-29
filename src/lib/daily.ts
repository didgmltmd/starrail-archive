// Real-time note (Trailblaze Power), daily check-in and the related alerts.
// Runs from App so alerts keep working on every tab and while the window sits in the tray.
import { useCallback, useEffect, useRef, useState } from "react";
import { describeError, isTauri } from "./hoyolab";

export interface Expedition {
  avatars: string[];
  status: string;
  remaining_time: number;
  name: string;
  item_url?: string;
}

export interface Note {
  current_stamina: number;
  max_stamina: number;
  stamina_recover_time: number;
  stamina_full_ts?: number;
  current_ts?: number;
  current_reserve_stamina: number;
  is_reserve_stamina_full: boolean;
  current_train_score: number;
  max_train_score: number;
  current_rogue_score: number;
  max_rogue_score: number;
  rogue_tourn_weekly_unlocked?: boolean;
  rogue_tourn_weekly_cur?: number;
  rogue_tourn_weekly_max?: number;
  grid_fight_weekly_cur?: number;
  grid_fight_weekly_max?: number;
  weekly_cocoon_cnt: number;
  weekly_cocoon_limit: number;
  accepted_epedition_num: number;
  total_expedition_num: number;
  expeditions: Expedition[];
}

export interface Award {
  name: string;
  cnt: number;
  icon: string;
}

export interface CheckinInfo {
  is_sign: boolean;
  total_sign_day: number;
  today: string;
  sign_cnt_missed: number;
}

export interface CheckinState {
  info: CheckinInfo;
  awards: Award[];
  signedNow: boolean;
  captcha: boolean;
  /** When this result was fetched (ms) */
  at: number;
}

export interface DailySettings {
  /** Windows alert when Trailblaze Power reaches `alertAt` */
  alert: boolean;
  alertAt: number;
  /** Alert when all dispatches are done */
  alertDispatch: boolean;
  /** Closing the window keeps the app in the tray */
  keepInTray: boolean;
  /** Claim the HoYoLAB daily check-in automatically */
  autoCheckin: boolean;
}

/** Trailblaze Power regenerates 1 point every 6 minutes. */
export const STAMINA_SECONDS = 360;
export const CHECKIN_PAGE =
  "https://act.hoyolab.com/bbs/event/signin/hkrpg/e202303301540311.html?act_id=e202303301540311";

const SETTINGS_KEY = "sra.daily.settings";
const NOTE_KEY = "sra.daily.note";
const CHECKIN_KEY = "sra.daily.checkin";
const ALERTED_KEY = "sra.daily.alerted";
const TRAY_TOLD_KEY = "sra.daily.trayTold";

const DEFAULTS: DailySettings = { alert: true, alertAt: 280, alertDispatch: false, keepInTray: true, autoCheckin: true };

const NOTE_EVERY_MS = 15 * 60 * 1000;
const CHECKIN_EVERY_MS = 60 * 60 * 1000;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // storage unavailable: only this session keeps it
  }
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export async function notify(title: string, body: string) {
  if (!isTauri) return;
  try {
    const n = await import("@tauri-apps/plugin-notification");
    let ok = await n.isPermissionGranted();
    if (!ok) ok = (await n.requestPermission()) === "granted";
    if (ok) n.sendNotification({ title, body });
  } catch {
    // notifications unavailable on this system
  }
}

/** HoYoLAB's day changes at 00:00 UTC+8. */
export function hoyoDay(now = Date.now()) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Seconds until full, counted from now (0 when full). */
export function secondsToFull(note: Note, fetchedAt: number, now = Date.now()) {
  if (note.current_stamina >= note.max_stamina) return 0;
  const full = note.stamina_full_ts
    ? note.stamina_full_ts * 1000
    : fetchedAt + note.stamina_recover_time * 1000;
  return Math.max(0, (full - now) / 1000);
}

/** Trailblaze Power right now, estimated from the last fetch. */
export function staminaNow(note: Note, fetchedAt: number, now = Date.now()) {
  if (note.current_stamina >= note.max_stamina) return note.current_stamina;
  return Math.max(
    note.current_stamina,
    note.max_stamina - Math.ceil(secondsToFull(note, fetchedAt, now) / STAMINA_SECONDS),
  );
}

/** When Trailblaze Power reaches `target` (ms), or null when it already has. */
export function reachAt(note: Note, fetchedAt: number, target: number, now = Date.now()) {
  if (staminaNow(note, fetchedAt, now) >= target) return null;
  const full = now + secondsToFull(note, fetchedAt, now) * 1000;
  return full - (note.max_stamina - target) * STAMINA_SECONDS * 1000;
}

export function clockText(ms: number) {
  const d = new Date(ms);
  const today = new Date();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === today.toDateString()) return `오늘 ${hm}`;
  const tomorrow = new Date(today.getTime() + 86400000);
  if (d.toDateString() === tomorrow.toDateString()) return `내일 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

export function durationText(sec: number) {
  const m = Math.ceil(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}시간 ${m % 60}분` : `${m}분`;
}

export interface DailyState {
  note: Note | null;
  noteAt: number | null;
  noteError: string | null;
  loading: boolean;
  checkin: CheckinState | null;
  checkinError: string | null;
  checking: boolean;
  settings: DailySettings;
  setSettings: (patch: Partial<DailySettings>) => void;
  refresh: () => Promise<void>;
  checkinNow: () => Promise<void>;
  /** Ticks every 30 s so estimates on screen stay current */
  now: number;
}

export function useDaily(linked: string | null): DailyState {
  const cachedNote = read<{ note: Note; at: number }>(NOTE_KEY);
  const [note, setNote] = useState<Note | null>(cachedNote?.note ?? null);
  const [noteAt, setNoteAt] = useState<number | null>(cachedNote?.at ?? null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkin, setCheckin] = useState<CheckinState | null>(() => read<CheckinState>(CHECKIN_KEY));
  const [checkinError, setCheckinError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [settings, setAll] = useState<DailySettings>(() => ({ ...DEFAULTS, ...read<DailySettings>(SETTINGS_KEY) }));
  const [now, setNow] = useState(Date.now());
  const busy = useRef(false);
  const signing = useRef(false);

  const setSettings = useCallback((patch: Partial<DailySettings>) => {
    setAll((s) => {
      const next = { ...s, ...patch };
      write(SETTINGS_KEY, next);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!isTauri || !linked || busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const res = await invoke<{ note: Note }>("daily_note", { uid: null });
      const at = Date.now();
      setNote(res.note);
      setNoteAt(at);
      setNoteError(null);
      write(NOTE_KEY, { note: res.note, at });
    } catch (e) {
      setNoteError(describeError(e).message);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [linked]);

  const runCheckin = useCallback(
    async (sign: boolean) => {
      if (!isTauri || !linked || signing.current) return;
      signing.current = true;
      setChecking(true);
      try {
        const res = await invoke<Omit<CheckinState, "at">>("daily_checkin", { sign });
        const state = { ...res, awards: res.awards ?? [], at: Date.now() };
        setCheckin(state);
        setCheckinError(null);
        write(CHECKIN_KEY, state);
        if (res.signedNow) {
          const a = state.awards[state.info.total_sign_day - 1];
          notify("출석 체크 완료", a ? `오늘 보상: ${a.name} ×${a.cnt}` : "HoYoLAB 출석 보상을 받았어요.");
        } else if (res.captcha) {
          notify("출석 체크를 직접 해 주세요", "HoYoLAB이 보안 확인을 요청했어요. 앱의 '오늘' 탭에서 출석 페이지를 열 수 있어요.");
        }
      } catch (e) {
        setCheckinError(describeError(e).message);
      } finally {
        signing.current = false;
        setChecking(false);
      }
    },
    [linked],
  );

  // Note: at start and every 15 minutes (also while hidden in the tray)
  useEffect(() => {
    if (!linked) return;
    refresh();
    const t = setInterval(refresh, NOTE_EVERY_MS);
    return () => clearInterval(t);
  }, [linked, refresh]);

  // Check-in: once per HoYoLAB day, checked hourly
  useEffect(() => {
    if (!linked) return;
    const tick = () => {
      const last = read<CheckinState>(CHECKIN_KEY);
      const doneToday = last?.info?.is_sign && last.info.today === hoyoDay();
      if (doneToday) return;
      // After a captcha, do not retry the same day; the user checks in by hand.
      if (last?.captcha && hoyoDay(last.at) === hoyoDay()) return;
      runCheckin(settings.autoCheckin);
    };
    tick();
    const t = setInterval(tick, CHECKIN_EVERY_MS);
    return () => clearInterval(t);
  }, [linked, settings.autoCheckin, runCheckin]);

  // Clock for estimates and alerts
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  // Trailblaze Power and dispatch alerts, once per refill cycle
  useEffect(() => {
    if (!note || !noteAt) return;
    const alerted = read<{ stamina?: string; dispatch?: string }>(ALERTED_KEY) ?? {};
    const cycle = String(note.stamina_full_ts ?? Math.round((noteAt + note.stamina_recover_time * 1000) / 60000));
    const target = Math.min(settings.alertAt, note.max_stamina);
    if (settings.alert && alerted.stamina !== cycle && staminaNow(note, noteAt, now) >= target) {
      const left = secondsToFull(note, noteAt, now);
      notify(
        `개척력 ${staminaNow(note, noteAt, now)}/${note.max_stamina}`,
        left > 0 ? `${durationText(left)} 뒤 가득 차요 (${clockText(now + left * 1000)}).` : "개척력이 가득 찼어요. 넘치기 전에 써 주세요.",
      );
      alerted.stamina = cycle;
      write(ALERTED_KEY, alerted);
    }
    if (settings.alertDispatch && note.expeditions.length) {
      const last = Math.max(...note.expeditions.map((e) => noteAt + e.remaining_time * 1000));
      const key = String(Math.round(last / 60000));
      if (alerted.dispatch !== key && now >= last) {
        notify("파견 완료", "모든 파견이 끝났어요. 보상을 받아 주세요.");
        alerted.dispatch = key;
        write(ALERTED_KEY, alerted);
      }
    }
  }, [note, noteAt, now, settings.alert, settings.alertAt, settings.alertDispatch]);

  // Closing the window keeps the app in the tray while alerts are useful
  useEffect(() => {
    if (!isTauri) return;
    invoke("set_keep_in_tray", { enabled: !!linked && settings.keepInTray }).catch(() => {});
  }, [linked, settings.keepInTray]);

  useEffect(() => {
    if (!isTauri) return;
    let off: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) =>
      listen("app://hidden-to-tray", () => {
        if (read<boolean>(TRAY_TOLD_KEY)) return;
        write(TRAY_TOLD_KEY, true);
        notify("트레이에서 계속 실행 중이에요", "개척력 알림을 위해 앱이 작업 표시줄 트레이에 남아 있어요. 완전히 끄려면 트레이 아이콘을 우클릭해 '종료'를 눌러 주세요.");
      }).then((u) => (off = u)),
    );
    return () => off?.();
  }, []);

  return {
    note,
    noteAt,
    noteError,
    loading,
    checkin,
    checkinError,
    checking,
    settings,
    setSettings,
    refresh,
    checkinNow: () => runCheckin(true),
    now,
  };
}
