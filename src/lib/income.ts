// Monthly income (HoYoLAB Trailblaze calendar): Stellar Jade and Star Rail Pass income per month.
import { useCallback, useEffect, useState } from "react";
import { describeError, isTauri } from "./hoyolab";

export interface IncomeSource {
  action: string;
  action_name: string;
  num: number;
  percent: number;
}

export interface LedgerMonth {
  uid: string;
  /** Months HoYoLAB keeps, newest first (YYYYMM) */
  optional_month: string[];
  month: string;
  data_month?: string;
  month_data: {
    current_hcoin: number;
    current_rails_pass: number;
    last_hcoin: number;
    last_rails_pass: number;
    hcoin_rate?: number;
    rails_rate?: number;
    group_by: IncomeSource[];
  };
  day_data?: {
    current_hcoin: number;
    current_rails_pass: number;
    last_hcoin?: number;
    last_rails_pass?: number;
  };
}

const CACHE = (m: string) => `sra.income.${m}`;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

function cached(month: string): LedgerMonth | null {
  try {
    const raw = localStorage.getItem(CACHE(month));
    return raw ? (JSON.parse(raw) as LedgerMonth) : null;
  } catch {
    return null;
  }
}

export function monthLabel(m: string) {
  return `${m.slice(0, 4)}년 ${Number(m.slice(4, 6))}월`;
}

export interface IncomeState {
  data: LedgerMonth | null;
  month: string;
  setMonth: (m: string) => void;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useIncome(linked: string | null): IncomeState {
  const [month, setMonth] = useState("");
  const [data, setData] = useState<LedgerMonth | null>(() => cached("current"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isTauri || !linked) return;
    let alive = true;
    setLoading(true);
    const c = cached(month || "current");
    if (c) setData(c);
    invoke<LedgerMonth>("ledger_month", { uid: null, month: month || null })
      .then((v) => {
        if (!alive) return;
        setData(v);
        setError(null);
        try {
          localStorage.setItem(CACHE(month || "current"), JSON.stringify(v));
        } catch {
          // storage full
        }
      })
      .catch((e) => alive && setError(describeError(e).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [linked, month, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, month: month || data?.data_month || data?.month || "", setMonth, loading, error, reload };
}
