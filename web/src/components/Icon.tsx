// Набір контурних іконок (24×24, stroke = currentColor) у стилі дизайн-системи «Стежка».
import type { CSSProperties } from 'react';

const PATHS = {
  logo: <path d="M3 19 9 9l4 6 3-4 5 8H3z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h6a3 3 0 0 0 0-6H10a3 3 0 0 1 0-6h6" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.4 3.3-5 6.5-5s5.7 1.6 6.5 5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.2 2.3 3.5 5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
  shieldCheck: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  logout: <><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  flag: <path d="M5 21V4h11l-1.5 4L16 12H5" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M4 20h16" />,
  upload: <path d="M12 15V4M7 9l5-5 5 5M4 20h16" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  crosshair: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a10 10 0 0 0 4.4-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  collapse: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  navigation: <path d="m3 11 18-8-8 18-2-8z" />,
  comment: <path d="M4 5h16v11H9l-5 4z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  walk: <><circle cx="13" cy="4" r="2" /><path d="m9 21 2-6 3 3v3M8 12l2-4 4 1 2 3" /></>,
  hike: <path d="M3 20 10 8l4 6 2-3 5 9z" />,
  bike: <><circle cx="6" cy="17" r="3.5" /><circle cx="18" cy="17" r="3.5" /><path d="M6 17 10 9h5l3 8M9 6h3" /></>,
  car: <><path d="M4 16V12l2-5h12l2 5v4zM4 16v2M20 16v2" /><circle cx="8" cy="13.5" r="1" /><circle cx="16" cy="13.5" r="1" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  castle: <path d="M4 21V8l3 2V6l3 2V4h4v4l3-2v4l3-2v13z" />,
  tree: <path d="M7 21h10M12 21V11M12 11 7 16M12 11l5-6" />,
  home: <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  layers: <path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5" />,
  sliders: <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" />,
} as const;

export type IconName = keyof typeof PATHS;

interface Props { name: IconName; size?: number; stroke?: number; className?: string; style?: CSSProperties; fill?: string; title?: string }

export function Icon({ name, size = 20, stroke = 2, className, style, fill = 'none', title }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" className={className} style={style}
      aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} aria-label={title}>
      {PATHS[name]}
    </svg>
  );
}

/** Заповнена зірка рейтингу. */
export function Star({ size = 16, color = '#E39B2D' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </svg>
  );
}

export const MODE_ICON: Record<string, IconName> = { WALK: 'walk', HIKE: 'hike', BIKE: 'bike', CAR: 'car' };
export const CATEGORY_ICON: Record<string, IconName> = { HISTORY: 'castle', NATURE: 'tree', INFRASTRUCTURE: 'info', PET_FRIENDLY: 'pin', OTHER: 'pin' };
