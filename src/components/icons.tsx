import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const IconCharacter = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="7.5" r="3.5" />
    <path d="M4.5 20.5c.8-4.2 3.8-6.5 7.5-6.5s6.7 2.3 7.5 6.5" />
  </svg>
);

export const IconRoster = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="3.5" width="7" height="9" rx="1.2" />
    <rect x="13.5" y="3.5" width="7" height="9" rx="1.2" />
    <rect x="3.5" y="15" width="7" height="5.5" rx="1.2" />
    <rect x="13.5" y="15" width="7" height="5.5" rx="1.2" />
  </svg>
);

export const IconRelic = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 2.8 19.5 7v10L12 21.2 4.5 17V7z" />
    <path d="M12 7.5 15.5 9.5v5L12 16.5l-3.5-2v-5z" />
  </svg>
);

export const IconFarm = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m15.5 8.5-2 5-5 2 2-5z" />
  </svg>
);

export const IconFriends = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19.5c.6-3.6 3-5.6 6-5.6s5.4 2 6 5.6" />
    <path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2M17.5 14.2c2 .6 3.2 2.4 3.5 5.3" />
  </svg>
);

export const IconLink = (p: P) => (
  <svg {...base} {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconMinimize = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 12h12" />
  </svg>
);

export const IconMaximize = (p: P) => (
  <svg {...base} {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </svg>
);

export const IconStar = (p: P) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 1.5c.5 5.2 2.9 8.6 10.5 10.5-7.6 1.9-10 5.3-10.5 10.5-.5-5.2-2.9-8.6-10.5-10.5C9.1 10.1 11.5 6.7 12 1.5z" />
  </svg>
);

export const IconChevron = (p: P) => (
  <svg {...base} {...p}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const IconRefresh = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v3.5h3.5" />
    <path d="M4 13a8 8 0 0 0 14.6 4.5M20 20v-3.5h-3.5" />
  </svg>
);

export const IconTrophy = (p: P) => (
  <svg {...base} {...p}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
    <path d="M8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11" />
    <path d="M12 13v4M8.5 20.5h7M10 17h4l.5 3.5h-5z" />
  </svg>
);

export const IconWarp = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 2.8l1.9 5.6 5.9.1-4.7 3.5 1.7 5.7L12 14.3l-4.8 3.4 1.7-5.7-4.7-3.5 5.9-.1z" />
    <path d="M4 20.5h16" />
  </svg>
);

export const IconToday = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M13 6.5 9.5 12.5h3.5L11 17.5" />
  </svg>
);

export const IconIncome = (p: P) => (
  <svg {...base} {...p}>
    <ellipse cx="12" cy="6.5" rx="6.5" ry="2.7" />
    <path d="M5.5 6.5v5c0 1.5 2.9 2.7 6.5 2.7s6.5-1.2 6.5-2.7v-5" />
    <path d="M5.5 11.5v5c0 1.5 2.9 2.7 6.5 2.7s6.5-1.2 6.5-2.7v-5" />
  </svg>
);

export const IconPlanner = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 20.5h16" />
    <path d="M6.5 17v-4M12 17V9M17.5 17V5" />
    <path d="m15 7.5 2.5-2.5L20 7.5" />
  </svg>
);

export const IconSpeed = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.5 16a8.5 8.5 0 1 1 17 0" />
    <path d="m12 16 4-5.5" />
    <circle cx="12" cy="16" r="1.2" />
    <path d="M6.5 16h-1M18.5 16h-1M7.6 10.4l.7.7" />
  </svg>
);
