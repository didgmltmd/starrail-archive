import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/noto-sans-kr";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "./styles/app.css";
import App from "./App";
import { refreshGameData } from "./data/remote";

// Friend sharing was removed in 0.1.6: drop its leftover settings.
try {
  for (const k of Object.keys(localStorage)) if (k.startsWith("sra.friends.")) localStorage.removeItem(k);
} catch {
  // storage unavailable
}

// Pick up new characters / relics / recommended builds before the first render.
refreshGameData().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
