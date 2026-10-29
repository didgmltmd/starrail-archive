import { isTauri } from "./hoyolab";

/** Opens a link in the user's normal browser (not inside the app window). */
export async function openExternal(url: string) {
  if (!/^https?:\/\//.test(url)) return;
  if (isTauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}
