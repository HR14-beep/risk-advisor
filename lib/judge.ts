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

// 5년 평균 ± 배수 × 표준편차. 높을수록 위험하면 더하고, 낮을수록 위험하면 뺀다.
// 값이 2개보다 적거나 표준편차가 0(5년 값이 모두 같음)이면 임계점을 정할 수 없어 null
export function sigmaThresholds(
  history: number[],
  direction: JudgeDirection,
  multipliers: Partial<Record<RiskLevel, number>>,
): Thresholds | null {
  if (history.length < 2) return null;
  const m = mean(history);
  const sd = standardDeviation(history);
  if (!(sd > 0)) return null;
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

// 5년 중 빠진 기간이 있어도 이 비율 이상 있으면 있는 값으로 임계점을 계산한다 (월 54개·분기 18개 이상)
export const MIN_HISTORY_RATIO = 0.9;

export function minHistoryCount(windowSize: number): number {
  return Math.ceil(windowSize * MIN_HISTORY_RATIO);
}

// 판정하지 못한 이유
// noValue: 기준 기간 값이 없음 / insufficientHistory: 5년치 과거 값이 모자람
// noVariation: 5년 값이 모두 같아 표준편차가 0 / noReference: 기준값(목표값·담보가치)이 없음
export type JudgeFailure = "noValue" | "insufficientHistory" | "noVariation" | "noReference";

export type JudgeOutcome = { result: JudgeResult; failure: null } | { result: null; failure: JudgeFailure };

const fail = (failure: JudgeFailure): JudgeOutcome => ({ result: null, failure });

// 가중합: 구성값마다 5년 평균·표준편차로 표준화한 뒤 (방향 부호 ×) 가중치를 곱해 더한다.
// 기준 기간과, 앞 5년 중 구성값이 모두 있는 기간의 가중합 점수를 돌려준다
function compositeScores(
  indicator: IndicatorDefinition,
  seriesById: SeriesById,
  windowKeys: PeriodKey[],
  key: PeriodKey,
): { current: number; history: number[] } | JudgeFailure {
  const minCount = minHistoryCount(windowKeys.length);
  const perComponent = indicator.components!.map((component) => ({
    component,
    periods: aggregateByPeriod(seriesById[component.id] ?? [], indicator.publicationCycle),
  }));
  if (perComponent.some(({ periods }) => !periods.has(key))) return "noValue";

  // 구성값이 모두 있는 기간만 쓴다
  const sharedKeys = windowKeys.filter((k) => perComponent.every(({ periods }) => periods.has(k)));
  if (sharedKeys.length < minCount) return "insufficientHistory";

  const keys = [...sharedKeys, key];
  const totals = keys.map(() => 0);
  for (const { component, periods } of perComponent) {
    const values = keys.map((k) => periods.get(k)!.value);
    const window = values.slice(0, -1);
    const m = mean(window);
    const sd = standardDeviation(window);
    if (!(sd > 0)) return "noVariation";
    const sign = component.sign ?? 1;
    values.forEach((v, i) => (totals[i] += sign * component.weight * ((v - m) / sd)));
  }

  return { current: round(totals.at(-1)!), history: totals.slice(0, -1) };
}

// key 기간의 값을 판정하고, 판정하지 못하면 그 이유를 돌려준다
export function judgeOutcome(indicator: IndicatorDefinition, seriesById: SeriesById, key: PeriodKey): JudgeOutcome {
  const { threshold, direction } = indicator;
  const windowKeys = previousPeriods(key, historyLength(indicator.publicationCycle));

  let value: number;
  let thresholds: Thresholds | null;

  if (indicator.components) {
    if (threshold.kind !== "sigma") return fail("insufficientHistory");
    const scores = compositeScores(indicator, seriesById, windowKeys, key);
    if (typeof scores === "string") return fail(scores);
    value = scores.current;
    thresholds = sigmaThresholds(scores.history, direction, threshold.multipliers);
    if (!thresholds) return fail("noVariation");
  } else {
    const periods = aggregateByPeriod(seriesById[indicator.id] ?? [], indicator.publicationCycle);
    const current = periods.get(key);
    if (!current) return fail("noValue");
    value = round(current.value);

    if (threshold.kind === "sigma") {
      const history = windowKeys.flatMap((k) => {
        const v = periods.get(k)?.value;
        return v === undefined ? [] : [v];
      });
      if (history.length < minHistoryCount(windowKeys.length)) return fail("insufficientHistory");
      thresholds = sigmaThresholds(history, direction, threshold.multipliers);
      if (!thresholds) return fail("noVariation");
    } else {
      if (current.reference === undefined) return fail("noReference");
      thresholds = referenceThresholds(current.reference, threshold.ratios);
    }
  }

  const used = categoryThresholds(indicator, thresholds);
  return { result: { value, thresholds: used, status: judgeLevel(value, direction, used) }, failure: null };
}

// key 기간의 값을 판정한다. 판정하지 못하면 null
export function judgePeriod(indicator: IndicatorDefinition, seriesById: SeriesById, key: PeriodKey): JudgeResult | null {
  return judgeOutcome(indicator, seriesById, key).result;
}
