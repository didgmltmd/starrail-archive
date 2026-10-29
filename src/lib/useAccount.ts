import { useCallback, useEffect, useRef, useState } from "react";
import { mockAccount } from "../data/mock";
import type { Account } from "../types";
import { publishProfile } from "./friends";
import {
  AUTO_SYNC_AFTER_MS,
  describeError,
  fetchAccount,
  isTauri,
  linkStatus,
  loadCachedAccount,
  logout,
  onLoginEvents,
  openLogin,
  saveCachedAccount,
  SYNC_INTERVAL_MS,
} from "./hoyolab";

export interface AccountState {
  account: Account;
  /** true while showing the built-in sample account */
  demo: boolean;
  /** HoYoLAB account id when linked */
  linked: string | null;
  syncing: boolean;
  loggingIn: boolean;
  error: string | null;
  /** Problems that did not stop the sync (e.g. friend sharing failed) */
  warning: string | null;
  canLink: boolean;
  sync: () => Promise<void>;
  link: () => Promise<void>;
  unlink: () => Promise<void>;
}

export function useAccount(): AccountState {
  const [account, setAccount] = useState<Account>(() => loadCachedAccount() ?? mockAccount);
  const [linked, setLinked] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const busy = useRef(false);

  const sync = useCallback(async () => {
    if (!isTauri || busy.current) return;
    busy.current = true;
    setSyncing(true);
    setError(null);
    try {
      const { account: fresh, unknownTypes } = await fetchAccount();
      setAccount(fresh);
      saveCachedAccount(fresh);
      if (unknownTypes.length) console.warn("Unknown HoYoLAB property types:", unknownTypes);
      try {
        await publishProfile(fresh);
        setWarning(null);
      } catch (e) {
        setWarning(describeError(e).message);
      }
    } catch (e) {
      const { code, message } = describeError(e);
      setError(message);
      if (code === "LOGIN_EXPIRED" || code === "LOGIN_REQUIRED") setLinked(null);
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, []);

  // On start: check the stored link, sync when the cache is stale.
  useEffect(() => {
    let alive = true;
    linkStatus().then((id) => {
      if (!alive) return;
      setLinked(id);
      const cached = loadCachedAccount();
      const age = cached ? Date.now() - new Date(cached.updatedAt).getTime() : Infinity;
      if (id && age > AUTO_SYNC_AFTER_MS) sync();
    });
    return () => {
      alive = false;
    };
  }, [sync]);

  // While open, sync periodically.
  useEffect(() => {
    if (!linked) return;
    const t = setInterval(sync, SYNC_INTERVAL_MS);
    return () => clearInterval(t);
  }, [linked, sync]);

  // Results from the login window.
  useEffect(() => {
    if (!isTauri) return;
    let off: (() => void) | undefined;
    onLoginEvents({
      linked: (id) => {
        setLoggingIn(false);
        setLinked(id);
        sync();
      },
      closed: () => setLoggingIn(false),
      error: (msg) => {
        setLoggingIn(false);
        setError(msg);
      },
    }).then((f) => (off = f));
    return () => off?.();
  }, [sync]);

  const link = useCallback(async () => {
    setError(null);
    setLoggingIn(true);
    try {
      await openLogin();
    } catch (e) {
      setLoggingIn(false);
      setError(describeError(e).message);
    }
  }, []);

  const unlink = useCallback(async () => {
    await logout().catch(() => {});
    saveCachedAccount(null);
    setLinked(null);
    setAccount(mockAccount);
    setError(null);
    setWarning(null);
  }, []);

  return {
    account,
    demo: account.source !== "hoyolab",
    linked,
    syncing,
    loggingIn,
    error,
    warning,
    canLink: isTauri,
    sync,
    link,
    unlink,
  };
}
