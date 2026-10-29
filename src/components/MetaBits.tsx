import { useState } from "react";
import type { Source } from "../data/meta";
import { openExternal } from "../lib/openExternal";

/** Small "출처" chips that open the source page in the browser. */
export function Sources({ sources }: { sources?: Source[] }) {
  if (!sources?.length) return null;
  return (
    <div className="sources">
      <span className="sources-label">출처</span>
      {sources.map((s, i) => (
        <button key={i} className="source-chip" title={`${s.url}\n확인: ${s.checked}`} onClick={() => openExternal(s.url)}>
          {s.title.length > 28 ? s.title.slice(0, 27) + "…" : s.title}
          <span className="num">{s.checked.slice(5).replace("-", ".")}</span>
        </button>
      ))}
    </div>
  );
}

/** Image that quietly disappears when the remote file is missing. */
export function RemoteImg({ src, title, className }: { src: string; title?: string; className?: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <img
      src={src}
      title={title}
      alt=""
      className={className}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setOk(false)}
    />
  );
}
