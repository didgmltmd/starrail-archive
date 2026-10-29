// Supabase client for friend sharing. The URL and anon key are baked into the build
// from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see docs/FRIENDS_SETUP.md).
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/** The shared client, or null when the build has no Supabase settings. */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  client ??= createClient(url!, anonKey!, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "sra.supabase.auth" },
  });
  return client;
}

/** Signs in anonymously once per install; the session is kept in localStorage. */
export async function ensureSession(sb: SupabaseClient): Promise<Session> {
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session;
  const { data: signed, error } = await sb.auth.signInAnonymously();
  if (error || !signed.session) {
    throw new Error(
      "친구 서버에 접속하지 못했어요. Supabase에서 익명 로그인(Anonymous sign-ins)이 켜져 있는지 확인해 주세요.",
    );
  }
  return signed.session;
}
