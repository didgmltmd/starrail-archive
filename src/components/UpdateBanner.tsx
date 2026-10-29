import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { isTauri } from "../lib/hoyolab";

type Update = Awaited<ReturnType<typeof import("@tauri-apps/plugin-updater").check>>;

/**
 * Checks GitHub Releases for a newer version on start (and every 6 hours).
 * When one exists, shows a small banner; one click downloads, installs, and restarts.
 */
export function UpdateBanner() {
  const [update, setUpdate] = useState<Update>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isTauri || import.meta.env.DEV) return;
    const run = () =>
      import("@tauri-apps/plugin-updater")
        .then(({ check }) => check())
        .then((u) => u && setUpdate(u))
        .catch(() => {}); // offline or no release yet: stay quiet
    run();
    const t = setInterval(run, 6 * 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const install = async () => {
    if (!update) return;
    setError(null);
    let total = 0;
    let done = 0;
    try {
      setProgress(0);
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        if (e.event === "Progress") {
          done += e.data.chunkLength;
          setProgress(total ? done / total : null);
        }
        if (e.event === "Finished") setProgress(1);
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      setProgress(null);
      setError(`업데이트에 실패했어요: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <AnimatePresence>
      {update && !dismissed && (
        <motion.div
          className="update-banner"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
        >
          <div className="update-text">
            <b>새 버전 {update.version}</b>
            <span>{error ?? (progress !== null ? "업데이트 받는 중…" : "업데이트하면 앱이 자동으로 다시 켜져요")}</span>
            {progress !== null && (
              <div className="update-bar">
                <i style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
              </div>
            )}
          </div>
          {progress === null && (
            <>
              <button className="pill-btn" onClick={install}>
                업데이트
              </button>
              <button className="update-later" onClick={() => setDismissed(true)}>
                나중에
              </button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
