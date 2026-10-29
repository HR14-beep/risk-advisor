// 지표 현황 화면에 보여 줄 행과 요약 개수를 만든다 (DESIGN.md §3.1, §4.1)
import { CATEGORIES, CATEGORY_LABELS, type Category, type IndicatorDefinition } from "@/lib/indicators";
import { hasValue, judgePeriod, type JudgeResult, type JudgeStatus, type SeriesById } from "@/lib/judge";
import { periodChange, type PeriodChange } from "@/lib/change";
import { publishDeadline, referencePeriod, shiftPeriod, type PeriodKey } from "@/lib/period";

// notYetPublished: 기준 기간 값이 아직 발표(입력)되지 않음
// collectionFailed: 이번 수집에 실패했고 저장된 값에도 기준 기간 값이 없음 (직전 값은 판정하지 않는다)
export type DisplayStatus = JudgeStatus | "notYetPublished" | "collectionFailed" | "noData";

// 요약 카드 순서 (DESIGN.md §3.1 ②)
export const DISPLAY_STATUSES: DisplayStatus[] = [
  "crisis",
  "warning",
  "caution",
  "normal",
  "notYetPublished",
  "collectionFailed",
  "noData",
];

// missing: 발표 시점이 지났는데 값이 없음 / insufficientHistory: 임계점 계산에 필요한 과거 값이 모자람
export type NoDataReason = "missing" | "insufficientHistory";

export type DashboardRow = {
  indicator: IndicatorDefinition;
  period: PeriodKey; // 이번 점검의 기준 기간
  result: JudgeResult | null;
  status: DisplayStatus;
  noDataReason: NoDataReason | null;
  deadline: string | null; // 발표 전일 때: 이 날까지 발표(입력) 예정
  needsUpdate: boolean; // 직접 입력 지표가 입력 기한을 넘김
  previous: { period: PeriodKey; result: JudgeResult | null } | null; // 발표 전·수집 실패일 때 참고로 보여 줄 직전 값
  change: PeriodChange | null;
  // 이번 수집에 실패했을 때: 저장소에 있는 마지막 값의 기준일 (기준 기간 값이 이미 저장돼 있으면 판정은 그대로 한다)
  collectionFailure: { lastDate: string | null } | null;
};

// 판정할 값들 중 마지막 기준일. 가중합 지표는 구성값이 모두 있는 마지막 날
function lastDate(indicator: IndicatorDefinition, seriesById: SeriesById): string | null {
  const ids = indicator.components?.map((c) => c.id) ?? [indicator.id];
  const dates = ids.map((id) => seriesById[id]?.at(-1)?.date ?? null);
  if (dates.some((d) => d === null)) return null;
  return (dates as string[]).sort()[0];
}

export type DashboardSection = { category: Category; label: string; rows: DashboardRow[] };

export type Dashboard = {
  sections: DashboardSection[];
  counts: Record<DisplayStatus, number>;
};

// 직전 발표 값을 찾을 때 거슬러 올라가는 최대 기간 수
const LOOKBACK_PERIODS = 12;

function latestPublishedBefore(
  indicator: IndicatorDefinition,
  seriesById: SeriesById,
  key: PeriodKey,
): PeriodKey | null {
  for (let i = 1; i <= LOOKBACK_PERIODS; i++) {
    const candidate = shiftPeriod(key, -i);
    if (hasValue(indicator, seriesById, candidate)) return candidate;
  }
  return null;
}

export function buildRow(
  indicator: IndicatorDefinition,
  seriesById: SeriesById,
  today: string,
  collectionFailed = false,
): DashboardRow {
  const period = referencePeriod(indicator.publicationCycle, today);
  const collectionFailure = collectionFailed ? { lastDate: lastDate(indicator, seriesById) } : null;
  const base = {
    indicator,
    period,
    result: null,
    noDataReason: null,
    deadline: null,
    needsUpdate: false,
    previous: null,
    change: null,
    collectionFailure,
  };

  const previousOf = () => {
    const previousPeriod = latestPublishedBefore(indicator, seriesById, period);
    return previousPeriod ? { period: previousPeriod, result: judgePeriod(indicator, seriesById, previousPeriod) } : null;
  };

  // 수집에 실패했는데 기준 기간 값도 없으면, 발표 여부를 알 수 없으므로 직전 값은 참고로만 보여 준다
  if (collectionFailed && !hasValue(indicator, seriesById, period)) {
    return { ...base, status: "collectionFailed", previous: previousOf() };
  }

  if (!hasValue(indicator, seriesById, period)) {
    const deadline = publishDeadline(indicator, period);
    const overdue = today > deadline;
    // 자동 수집 지표가 발표 시점을 넘기면 "데이터 없음". 직접 입력 지표는 "발표 전"에 "갱신 필요"를 붙인다
    if (overdue && indicator.collectionMethod === "auto") {
      return { ...base, status: "noData", noDataReason: "missing" };
    }
    return { ...base, status: "notYetPublished", deadline, needsUpdate: overdue, previous: previousOf() };
  }

  // 값을 추정해 채우지 않는다. 과거 값이 모자라면 판정하지 않는다 (PRD 5번)
  const result = judgePeriod(indicator, seriesById, period);
  if (!result) return { ...base, status: "noData", noDataReason: "insufficientHistory" };

  const before = shiftPeriod(period, -1);
  const beforeResult = hasValue(indicator, seriesById, before) ? judgePeriod(indicator, seriesById, before) : null;

  return {
    ...base,
    result,
    status: result.status,
    change: beforeResult
      ? periodChange(result.value, { period: before, value: beforeResult.value }, indicator.unit)
      : null,
  };
}

// 임계점을 넘은 지표를 위험한 순서대로 맨 앞에 두고, 나머지는 원래 순서를 지킨다
const EXCEEDED_RANK: Partial<Record<DisplayStatus, number>> = { crisis: 0, warning: 1, caution: 2 };

function sortRows(rows: DashboardRow[]): DashboardRow[] {
  return [...rows].sort((a, b) => (EXCEEDED_RANK[a.status] ?? 3) - (EXCEEDED_RANK[b.status] ?? 3));
}

// failedIds: 이번 수집에 실패한 지표 번호
export function buildDashboard(
  indicators: IndicatorDefinition[],
  seriesById: SeriesById,
  today: string,
  failedIds: ReadonlySet<string> = new Set(),
): Dashboard {
  const rows = indicators.map((indicator) => buildRow(indicator, seriesById, today, failedIds.has(indicator.id)));

  const counts = Object.fromEntries(DISPLAY_STATUSES.map((s) => [s, 0])) as Record<DisplayStatus, number>;
  for (const row of rows) counts[row.status] += 1;

  const sections = CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    rows: sortRows(rows.filter((row) => row.indicator.category === category)),
  }));

  return { sections, counts };
}
