// 단계 색과 표시 (지표 현황·지표 비교 화면이 같이 쓴다)
import { DISPLAY_STATUS_LABELS } from "@/lib/format";
import type { DisplayStatus } from "@/lib/dashboard";

// pill: 단계 표시 / dot: 색 점 / bar: 임계점을 넘은 줄의 왼쪽 띠
export const STATUS_STYLES: Record<DisplayStatus, { label: string; pill: string; dot: string; bar: string }> = {
  crisis: {
    label: DISPLAY_STATUS_LABELS.crisis,
    pill: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/30",
    dot: "bg-red-500",
    bar: "shadow-[inset_3px_0_0_var(--color-red-500)]",
  },
  warning: {
    label: DISPLAY_STATUS_LABELS.warning,
    pill: "bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/30",
    dot: "bg-orange-500",
    bar: "shadow-[inset_3px_0_0_var(--color-orange-500)]",
  },
  caution: {
    label: DISPLAY_STATUS_LABELS.caution,
    pill: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30",
    dot: "bg-amber-400",
    bar: "shadow-[inset_3px_0_0_var(--color-amber-400)]",
  },
  normal: {
    label: DISPLAY_STATUS_LABELS.normal,
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30",
    dot: "bg-emerald-500",
    bar: "",
  },
  notYetPublished: {
    label: DISPLAY_STATUS_LABELS.notYetPublished,
    pill: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/30",
    dot: "bg-sky-500",
    bar: "",
  },
  collectionFailed: {
    label: DISPLAY_STATUS_LABELS.collectionFailed,
    pill: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/30",
    dot: "bg-violet-500",
    bar: "",
  },
  noData: {
    label: DISPLAY_STATUS_LABELS.noData,
    pill: "bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-400/30",
    dot: "bg-slate-400",
    bar: "",
  },
};

export function StatusBadge({ status }: { status: DisplayStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${style.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden />
      {style.label}
    </span>
  );
}
