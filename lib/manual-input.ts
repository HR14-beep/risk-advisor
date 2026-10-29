// 직접 입력 화면에 보여 줄 지표별 현황과 저장 (DESIGN.md §3.2, §4.2, PLAN 작업 9)
import "server-only";
import { INDICATORS, type ValuePoint } from "@/lib/indicators";
import { aggregateByPeriod, historyLength, previousPeriods, publishDeadline, periodEnd, referencePeriod } from "@/lib/period";
import { loadSeries, saveValues } from "@/lib/value-store";
import type { ManualEntry } from "@/lib/schemas";
import { addDays } from "@/lib/dates";

export type ManualIndicatorStatus = {
  id: string;
  name: string;
  unit: string;
  referenceName: string | null; // 기준값이 필요한 지표만
  needsHistory: boolean; // 5년 표준편차 방식이라 과거 5년 값이 필요한지
  historyCount: number; // 앞 5년 중 저장된 달 수
  historyRequired: number;
  current: { value: number; reference?: number } | null; // 기준월에 이미 저장된 값
  latest: { period: string; value: number; reference?: number } | null; // 마지막으로 저장된 값
  needsUpdate: boolean; // 기준월이 끝나고 28일이 지나도 입력되지 않음
  deadline: string;
};

export type ManualInputData = { period: string; indicators: ManualIndicatorStatus[] };

const MANUAL = INDICATORS.filter((i) => i.collectionMethod === "manual");

export async function getManualInputData(today: string): Promise<ManualInputData> {
  const period = referencePeriod("monthly", today);
  // 5년치 과거 값과 기준월까지 넉넉히 불러온다
  const series = await loadSeries(
    MANUAL.map((i) => i.id),
    addDays(periodEnd(previousPeriods(period, 61)[0]), -1),
  );

  const indicators = MANUAL.map((indicator): ManualIndicatorStatus => {
    const periods = aggregateByPeriod(series[indicator.id] ?? [], "monthly");
    const keys = [...periods.keys()].sort();
    const latestKey = keys.at(-1);
    const needsHistory = indicator.threshold.kind === "sigma";
    const required = historyLength("monthly");
    const deadline = publishDeadline(indicator, period);
    return {
      id: indicator.id,
      name: indicator.name,
      unit: indicator.unit,
      referenceName: indicator.threshold.kind === "reference" ? indicator.threshold.referenceName : null,
      needsHistory,
      historyCount: needsHistory ? previousPeriods(period, required).filter((k) => periods.has(k)).length : 0,
      historyRequired: required,
      current: periods.get(period) ?? null,
      latest: latestKey ? { period: latestKey, ...periods.get(latestKey)! } : null,
      needsUpdate: !periods.has(period) && today > deadline,
      deadline,
    };
  });

  return { period, indicators };
}

// 검사를 통과한 값을 저장한다. 기준일은 그 달의 마지막 날로 한다
export async function saveManualEntries(entries: ManualEntry[]): Promise<number> {
  const byIndicator = new Map<string, ValuePoint[]>();
  for (const entry of entries) {
    const point: ValuePoint = { date: periodEnd(entry.period), value: entry.value };
    if (entry.reference !== undefined) point.reference = entry.reference;
    byIndicator.set(entry.indicatorId, [...(byIndicator.get(entry.indicatorId) ?? []), point]);
  }
  for (const [id, points] of byIndicator) await saveValues(id, points, "manual");
  return entries.length;
}
