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
