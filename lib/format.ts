// 화면과 보고서에서 같이 쓰는 표기 (단계 이름, 숫자·단위, 날짜)
import type { PeriodChange } from "@/lib/change";
import type { DisplayStatus, NoDataReason } from "@/lib/dashboard";

export const DISPLAY_STATUS_LABELS: Record<DisplayStatus, string> = {
  crisis: "위기",
  warning: "경계",
  caution: "주의",
  normal: "정상",
  notYetPublished: "발표 전",
  collectionFailed: "수집 실패",
  noData: "데이터 없음",
};

export const NO_DATA_REASONS: Record<NoDataReason, string> = {
  missing: "발표 시점이 지났는데 값이 없음",
  insufficientHistory: "임계점 계산에 필요한 5년치 값이 모자람",
  noVariation: "5년 값이 모두 같아 임계점을 정할 수 없음",
  noReference: "기준값(목표값·담보가치)이 입력되지 않음",
};

const numberFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatValue(value: number, unit: string): string {
  if (unit === "%") return `${formatNumber(value)}%`;
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

export function formatChange(change: PeriodChange): string {
  const sign = change.change > 0 ? "+" : "";
  return `${sign}${formatNumber(change.change)}${change.unit}`;
}

// "M월 D일" (발표 예정일 안내용)
export function formatDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}월 ${day}일`;
}
