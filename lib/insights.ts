// 보고서 시사점에 쓸 외부 통계 요약 (PRD 5번 must 2, PLAN 작업 16)
// 수집한 공개 통계로 5년 평균·범위 안 위치·전년 같은 기간 대비·최근 추세를 계산해 AI에게 넘긴다.
// AI는 이 숫자만 근거로 시사점을 쓰고, 새로 계산하거나 전망하지 않는다.
import type { IndicatorDefinition, PublicationCycle, ValuePoint } from "@/lib/indicators";
import type { SeriesById } from "@/lib/judge";
import { periodChange } from "@/lib/change";
import { formatChange, formatNumber, formatValue } from "@/lib/format";
import { aggregateByPeriod, historyLength, periodLabel, previousPeriods, shiftPeriod, type PeriodKey } from "@/lib/period";

// 5년이 다 차지 않아도 이만큼 있으면 범위를 알려 준다
const MIN_RANGE_PERIODS = 12;
// "연속 상승·하락"으로 볼 기간 수
const TREND_PERIODS = 3;

export type SeriesStats = {
  period: PeriodKey;
  value: number;
  range: { periods: number; first: PeriodKey; mean: number; min: number; max: number; rank: number } | null; // rank: 이하인 값의 비율(%)
  yearAgo: { period: PeriodKey; text: string } | null;
  trend: "up" | "down" | null;
};

export function seriesStats(
  points: ValuePoint[],
  cycle: PublicationCycle,
  period: PeriodKey,
  unit: string,
): SeriesStats | null {
  const periods = aggregateByPeriod(points, cycle);
  const current = periods.get(period);
  if (!current) return null;
  const value = current.value;

  const windowKeys = previousPeriods(period, historyLength(cycle)).filter((k) => periods.has(k));
  const window = windowKeys.map((k) => periods.get(k)!.value);
  const range =
    window.length >= MIN_RANGE_PERIODS
      ? {
          periods: window.length,
          first: windowKeys[0],
          mean: window.reduce((sum, v) => sum + v, 0) / window.length,
          min: Math.min(...window),
          max: Math.max(...window),
          rank: Math.round((window.filter((v) => v <= value).length / window.length) * 100),
        }
      : null;

  const yearAgoKey = shiftPeriod(period, cycle === "quarterly" ? -4 : -12);
  const yearAgoValue = periods.get(yearAgoKey)?.value;
  const yearAgoChange =
    yearAgoValue === undefined ? null : periodChange(value, { period: yearAgoKey, value: yearAgoValue }, unit);

  const recent = [...previousPeriods(period, TREND_PERIODS), period].map((k) => periods.get(k)?.value);
  let trend: SeriesStats["trend"] = null;
  if (recent.every((v) => v !== undefined)) {
    const steps = recent.slice(1).map((v, i) => v! - recent[i]!);
    if (steps.every((d) => d > 0)) trend = "up";
    else if (steps.every((d) => d < 0)) trend = "down";
  }

  return {
    period,
    value,
    range,
    yearAgo: yearAgoChange ? { period: yearAgoKey, text: formatChange(yearAgoChange) } : null,
    trend,
  };
}

function rangePosition(stats: NonNullable<SeriesStats["range"]>, value: number): string {
  if (value >= stats.max) return "기간 중 최고";
  if (value <= stats.min) return "기간 중 최저";
  return stats.rank >= 50 ? `상위 ${100 - stats.rank}%` : `하위 ${stats.rank}%`;
}

// 한 줄로 적는다. 예: "2026년 9월 76 · 5년(2021년 9월~) 평균 85.2, 범위 68~95, 하위 8% · 전년 같은 달 대비 -9.5% · 최근 3개월 연속 하락"
export function describeStats(name: string, stats: SeriesStats, unit: string, cycle: PublicationCycle): string {
  const parts = [`${name} ${periodLabel(stats.period)} ${formatValue(stats.value, unit)}`];
  if (stats.range) {
    const span = stats.range.periods >= historyLength(cycle) ? "5년" : `최근 ${stats.range.periods}개 기간`;
    parts.push(
      `${span}(${periodLabel(stats.range.first)}~) 평균 ${formatNumber(stats.range.mean)}, 범위 ${formatNumber(stats.range.min)}~${formatNumber(stats.range.max)}, ${rangePosition(stats.range, stats.value)}`,
    );
  }
  if (stats.yearAgo) parts.push(`전년 같은 ${cycle === "quarterly" ? "분기" : "달"} 대비 ${stats.yearAgo.text}`);
  if (stats.trend) {
    const span = cycle === "quarterly" ? `${TREND_PERIODS}분기` : `${TREND_PERIODS}개월`;
    parts.push(`최근 ${span} 연속 ${stats.trend === "up" ? "상승" : "하락"}`);
  }
  return parts.join(" · ");
}

// 지표 하나의 외부 통계 요약 줄들. 가중합 지표는 구성값마다 한 줄씩
export function indicatorInsights(indicator: IndicatorDefinition, seriesById: SeriesById, period: PeriodKey): string[] {
  const cycle = indicator.publicationCycle;
  if (indicator.components) {
    return indicator.components.flatMap((component) => {
      const stats = seriesStats(seriesById[component.id] ?? [], cycle, period, component.unit ?? "");
      return stats ? [`${describeStats(component.name, stats, component.unit ?? "", cycle)} (출처: ${component.source.name})`] : [];
    });
  }
  const stats = seriesStats(seriesById[indicator.id] ?? [], cycle, period, indicator.unit);
  return stats ? [`${describeStats(indicator.name, stats, indicator.unit, cycle)} (출처: ${indicator.source.name})`] : [];
}
