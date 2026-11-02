import { useState } from "react";

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
