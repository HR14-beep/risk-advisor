// 임계점 계산과 판정 (DESIGN.md §7, PLAN 작업 4)
// AI는 관여하지 않는다. 지표 정의의 임계점 산정식과 값으로만 계산한다.
import {
  CATEGORY_LEVELS,
  RISK_LEVELS,
  type IndicatorDefinition,
  type JudgeDirection,
  type RiskLevel,
  type ValuePoint,
} from "@/lib/indicators";
import { aggregateByPeriod, historyLength, previousPeriods, type PeriodKey } from "@/lib/period";

// 화면에는 단계에 "정상"을 더해 보여 준다 (PRD 5번)
export type JudgeStatus = RiskLevel | "normal";

// 분류마다 쓰는 단계만 들어 있다 (예: 조기경보지표는 경계만)
export type Thresholds = Partial<Record<RiskLevel, number>>;

export type JudgeResult = {
  value: number; // 판정에 쓴 값 (가중합 지표는 가중합 점수)
  thresholds: Thresholds;
  status: JudgeStatus;
};

// 지표 id 또는 가중합 구성값 id → 값 목록
export type SeriesById = Record<string, ValuePoint[]>;

// 0.1 + 0.2 = 0.30000000000000004 같은 소수 계산 오차 때문에
// 임계점과 같은 값이 다른 단계로 판정되지 않도록 자릿수를 정리한다
function round(value: number): number {
  return Math.round(value * 1e10) / 1e10;
}

export function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// 표본 표준편차 (엑셀 STDEV.S와 같다)
export function standardDeviation(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

// 임계점과 같으면 해당 단계로 판정하고, 여러 단계에 걸리면 가장 높은 단계를 택한다
export function judgeLevel(value: number, direction: JudgeDirection, thresholds: Thresholds): JudgeStatus {
  for (const level of RISK_LEVELS) {
    const threshold = thresholds[level];
    if (threshold === undefined) continue;
    const reached = direction === "above" ? value >= threshold : value <= threshold;
    if (reached) return level;
  }
  return "normal";
}

// 5년 평균 ± 배수 × 표준편차. 높을수록 위험하면 더하고, 낮을수록 위험하면 뺀다
export function sigmaThresholds(
  history: number[],
  direction: JudgeDirection,
  multipliers: Partial<Record<RiskLevel, number>>,
): Thresholds | null {
  if (history.length < 2) return null;
  const m = mean(history);
  const sd = standardDeviation(history);
  const sign = direction === "above" ? 1 : -1;
  const thresholds: Thresholds = {};
  for (const [level, k] of Object.entries(multipliers) as [RiskLevel, number][]) {
    thresholds[level] = round(m + sign * k * sd);
  }
  return thresholds;
}

export function referenceThresholds(
  reference: number,
  ratios: Partial<Record<RiskLevel, number>>,
): Thresholds {
  const thresholds: Thresholds = {};
  for (const [level, ratio] of Object.entries(ratios) as [RiskLevel, number][]) {
    thresholds[level] = round(reference * ratio);
  }
  return thresholds;
}

// 분류에서 쓰지 않는 단계는 빼 둔다
function categoryThresholds(indicator: IndicatorDefinition, thresholds: Thresholds): Thresholds {
  const result: Thresholds = {};
  for (const level of CATEGORY_LEVELS[indicator.category]) {
    if (thresholds[level] !== undefined) result[level] = thresholds[level];
  }
  return result;
}

// 판정할 값이 있는지 (가중합 지표는 구성값이 모두 있어야 한다)
export function hasValue(indicator: IndicatorDefinition, seriesById: SeriesById, key: PeriodKey): boolean {
  const ids = indicator.components?.map((c) => c.id) ?? [indicator.id];
  return ids.every((id) => aggregateByPeriod(seriesById[id] ?? [], indicator.publicationCycle).has(key));
}

// 가중합: 구성값마다 5년 평균·표준편차로 표준화한 뒤 가중치를 곱해 더한다.
// 기준 기간과 그 앞 5년 각각의 가중합 점수를 돌려준다. 값이 모자라면 null
function compositeScores(
  indicator: IndicatorDefinition,
  seriesById: SeriesById,
  windowKeys: PeriodKey[],
  key: PeriodKey,
): { current: number; history: number[] } | null {
  const keys = [...windowKeys, key];
  const totals = keys.map(() => 0);

  for (const component of indicator.components!) {
    const periods = aggregateByPeriod(seriesById[component.id] ?? [], indicator.publicationCycle);
    const values = keys.map((k) => periods.get(k)?.value);
    if (values.some((v) => v === undefined)) return null;
    const window = values.slice(0, -1) as number[];
    const m = mean(window);
    const sd = standardDeviation(window);
    if (!(sd > 0)) return null;
    values.forEach((v, i) => (totals[i] += component.weight * ((v! - m) / sd)));
  }

  return { current: round(totals.at(-1)!), history: totals.slice(0, -1) };
}

// key 기간의 값을 판정한다. 값이 없거나 임계점 계산에 필요한 값이 모자라면 null
export function judgePeriod(
  indicator: IndicatorDefinition,
  seriesById: SeriesById,
  key: PeriodKey,
): JudgeResult | null {
  const { threshold, direction } = indicator;
  const windowKeys = previousPeriods(key, historyLength(indicator.publicationCycle));

  let value: number;
  let thresholds: Thresholds | null;

  if (indicator.components) {
    const scores = compositeScores(indicator, seriesById, windowKeys, key);
    if (!scores || threshold.kind !== "sigma") return null;
    value = scores.current;
    thresholds = sigmaThresholds(scores.history, direction, threshold.multipliers);
  } else {
    const periods = aggregateByPeriod(seriesById[indicator.id] ?? [], indicator.publicationCycle);
    const current = periods.get(key);
    if (!current) return null;
    value = round(current.value);

    if (threshold.kind === "sigma") {
      const history = windowKeys.map((k) => periods.get(k)?.value);
      if (history.some((v) => v === undefined)) return null;
      thresholds = sigmaThresholds(history as number[], direction, threshold.multipliers);
    } else {
      if (current.reference === undefined) return null;
      thresholds = referenceThresholds(current.reference, threshold.ratios);
    }
  }

  if (!thresholds) return null;
  const used = categoryThresholds(indicator, thresholds);
  return { value, thresholds: used, status: judgeLevel(value, direction, used) };
}
