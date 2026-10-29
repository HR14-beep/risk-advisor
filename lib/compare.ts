// 지표 비교: 최근 3년 값과 같은 달(분기) 연도별 비교 (DESIGN.md §3.4, PLAN 작업 21)
// 값과 단계는 지표 현황과 같은 판정(judgeOutcome)으로 계산한다. 판정할 수 없는 기간도 값이 있으면 값만 보여 준다.
import type { IndicatorDefinition } from "@/lib/indicators";
import { judgeOutcome, type JudgeStatus, type SeriesById, type Thresholds } from "@/lib/judge";
import { aggregateByPeriod, referencePeriod, shiftPeriod, type PeriodKey } from "@/lib/period";
import { periodChange, type PeriodChange } from "@/lib/change";

export const COMPARE_YEARS = 3;

export type ComparePoint = {
  period: PeriodKey;
  value: number | null;
  status: JudgeStatus | null; // 판정하지 못한 기간은 null
  thresholds: Thresholds; // 그 기간에 쓴 임계점 (판정하지 못하면 빈 값)
};

export type CompareRow = {
  label: string; // "1월" 또는 "1분기"
  points: (ComparePoint | null)[]; // years 순서. 아직 오지 않은 기간은 null
  change: PeriodChange | null; // 마지막 해와 그 전해 비교
};

export type Comparison = {
  years: number[]; // 오래된 순서
  points: ComparePoint[]; // 그래프용: 기준 기간까지 3년치, 오래된 순서
  rows: CompareRow[];
};

function pointAt(indicator: IndicatorDefinition, seriesById: SeriesById, period: PeriodKey): ComparePoint {
  const outcome = judgeOutcome(indicator, seriesById, period);
  if (outcome.result) {
    const { value, status, thresholds } = outcome.result;
    return { period, value, status, thresholds };
  }
  // 가중합 지표의 점수는 판정해야 나온다. 단일 지표는 원래 값을 보여 준다
  const raw = indicator.components
    ? undefined
    : aggregateByPeriod(seriesById[indicator.id] ?? [], indicator.publicationCycle).get(period)?.value;
  return { period, value: raw ?? null, status: null, thresholds: {} };
}

export function buildComparison(indicator: IndicatorDefinition, seriesById: SeriesById, today: string): Comparison {
  const reference = referencePeriod(indicator.publicationCycle, today);
  const quarterly = indicator.publicationCycle === "quarterly";
  const perYear = quarterly ? 4 : 12;
  const count = COMPARE_YEARS * perYear;

  const points = Array.from({ length: count }, (_, i) => pointAt(indicator, seriesById, shiftPeriod(reference, i - count + 1)));
  const byPeriod = new Map(points.map((p) => [p.period, p]));

  const lastYear = Number(reference.slice(0, 4));
  const years = Array.from({ length: COMPARE_YEARS }, (_, i) => lastYear - COMPARE_YEARS + 1 + i);

  const rows = Array.from({ length: perYear }, (_, i): CompareRow => {
    const suffix = quarterly ? `Q${i + 1}` : String(i + 1).padStart(2, "0");
    // 3년 그래프 범위보다 앞선 기간(첫해 앞부분)도 표에는 채운다
    const yearPoints = years.map((year) => {
      const period = `${year}-${suffix}`;
      if (period > reference) return null;
      return byPeriod.get(period) ?? pointAt(indicator, seriesById, period);
    });
    const [before, last] = yearPoints.slice(-2);
    const change =
      last?.value != null && before?.value != null
        ? periodChange(last.value, { period: before.period, value: before.value }, indicator.unit)
        : null;
    return { label: quarterly ? `${i + 1}분기` : `${i + 1}월`, points: yearPoints, change };
  });

  return { years, points, rows };
}
