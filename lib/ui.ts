// 화면들이 같이 쓰는 모양 (버튼·카드·입력 칸). 색은 app/globals.css에서 정한다

export const CARD = "rounded-xl border border-line bg-surface shadow-sm";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-accent text-white shadow-sm hover:opacity-90 dark:text-slate-950`;

export const BUTTON_SECONDARY = `${BUTTON_BASE} border border-line bg-surface text-foreground hover:bg-surface-muted`;

export const INPUT =
  "rounded-lg border border-line bg-surface px-3 py-1.5 text-right shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500/20";

// 표 머리줄과 칸
export const TH = "px-4 py-2.5 text-xs font-medium text-muted";
export const TD = "px-4 py-3";

// 작은 표시 (갱신 필요, 고침 등)
export const TAG = "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset";

// 안내 띠
export const NOTICE_INFO = "rounded-lg border border-line bg-accent-soft px-4 py-3 text-sm text-foreground/80";
export const NOTICE_WARN =
  "rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/60 dark:text-amber-100";
export const NOTICE_ERROR =
  "rounded-lg border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800/60 dark:bg-red-950/60 dark:text-red-100";
