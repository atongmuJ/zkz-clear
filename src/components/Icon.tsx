import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "broom" | "gear" | "chart" | "drive" | "pulse"
  | "moon" | "star" | "scan" | "check" | "close"
  | "minus" | "square" | "shield" | "warning" | "arrow"
  | "folder" | "sparkle" | "refresh" | "info" | "clock"
  | "cpu" | "memory" | "browser" | "trash" | "log" | "image"
  | "software" | "search" | "external";

const paths: Record<IconName, ReactNode> = {
  broom: <><path d="M18 3 8 13" /><path d="M8 13 3 18l2 2 2-1 1 2 5-5-5-3Z" /><path d="m11 10 2 2" /></>,
  gear: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M2 20h20" /></>,
  drive: <><rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="7" cy="12" r="1.5" /><path d="M12 12h6" /></>,
  pulse: <><path d="M2 12h4l3-8 4 16 3-8h6" /></>,
  moon: <><path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z" /></>,
  star: <><path d="m12 2 2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5L12 2Z" /></>,
  scan: <><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M3 12h18" /></>,
  check: <><path d="m4 12 5 5L20 6" /></>,
  close: <><path d="M5 5 19 19M19 5 5 19" /></>,
  minus: <><path d="M5 12h14" /></>,
  square: <><rect x="5" y="5" width="14" height="14" rx="1" /></>,
  shield: <><path d="M12 2 20 6v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4Z" /><path d="m9 12 2 2 4-4" /></>,
  warning: <><path d="M12 3 22 21H2L12 3Z" /><path d="M12 9v5M12 18h.01" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  folder: <><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" /></>,
  sparkle: <><path d="m12 2 1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14-5L4 8M4 4v4h4M4 13a8 8 0 0 0 14 5l2-2M20 20v-4h-4" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="1" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>,
  memory: <><rect x="3" y="6" width="18" height="12" rx="1" /><path d="M7 6V3M12 6V3M17 6V3M7 18v3M12 18v3M17 18v3" /></>,
  browser: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 9h20M6 6.5h.01M9 6.5h.01" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" /></>,
  log: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
  software: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
  external: <><path d="M14 4h6v6M20 4l-8 8" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
