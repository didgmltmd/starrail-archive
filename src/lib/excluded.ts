// Characters the user does not plan to build. They are left out of the build check
// summary and the farming ranking. Stored on this PC only.
import { useCallback, useSyncExternalStore } from "react";
import type { Account } from "../types";

const KEY = "sra.excluded";
const EVENT = "sra:excluded-changed";

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

let cache = read();

function write(ids: string[]) {
  cache = ids;
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable: keeps working for this session
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function useExcluded() {
  const ids = useSyncExternalStore(subscribe, () => cache);
  const isExcluded = useCallback((id: string) => ids.includes(id), [ids]);
  const toggle = useCallback((id: string) => {
    write(cache.includes(id) ? cache.filter((x) => x !== id) : [...cache, id]);
  }, []);
  const clear = useCallback(() => write([]), []);
  return { ids, isExcluded, toggle, clear };
}

/** The account with excluded characters removed (for calculations). */
export function withoutExcluded(account: Account, ids: string[]): Account {
  if (!ids.length) return account;
  return { ...account, characters: account.characters.filter((c) => !ids.includes(c.id)) };
}
