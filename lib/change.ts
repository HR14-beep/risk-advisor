// 직전 기간 대비 변동 계산 (DESIGN.md §7, PLAN 작업 7)
// 월 지표는 지난달, 분기 지표는 직전 분기와 비교한다.

export type PeriodChange = {
  basePeriod: string; // 비교 기준이 된 기간
  baseValue: number;
  change: number;
  unit: "%p" | "%" | "점"; // %·점 단위는 차이, 나머지는 변동률(%)
};

export function periodChange(
  current: number,
  base: { period: string; value: number },
  unit: string,
): PeriodChange | null {
  if (unit === "%" || unit === "점") {
    return {
      basePeriod: base.period,
      baseValue: base.value,
      change: round(current - base.value),
      unit: unit === "%" ? "%p" : "점",
    };
  }
  if (base.value === 0) return null;
  return {
    basePeriod: base.period,
    baseValue: base.value,
    change: round(((current - base.value) / Math.abs(base.value)) * 100),
    unit: "%",
  };
}

function round(value: number): number {
  return Math.round(value * 1e10) / 1e10;
}
