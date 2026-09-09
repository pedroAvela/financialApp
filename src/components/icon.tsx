import type { CSSProperties } from "react";

const paths = {
  wallet: "M3 6h16v14H3V6Zm0 0V4h13v2m0 6h5v4h-5v-4Z",
  dashboard: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  history: "M4 7h16M4 12h16M4 17h10",
  plan: "M4 20V10m8 10V4m8 16v-7",
  settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  up: "m6 14 6-6 6 6M12 8v12",
  down: "m6 10 6 6 6-6M12 4v12",
  check: "m5 12 4 4L19 6",
  calendar: "M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14",
  logout: "M9 4H4v16h5m-1-8h13m-5-5 5 5-5 5",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6",
  search: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
};

export type IconName = keyof typeof paths;
export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
