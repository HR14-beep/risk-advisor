// 기준 기간과 "발표 전" 판단 (PLAN 작업 5)
// 매월 점검할 때는 전월분을 본다 (예: 9월 점검 → 8월분). 분기 지표는 그때까지 끝난 마지막 분기를 본다.
// 기간은 월 "2026-08", 분기 "2026-Q2" 같은 문자열로 다룬다.
import type { IndicatorDefinition, PublicationCycle, ValuePoint } from "@/lib/indicators";
import { addBusinessDays, addDays, monthEnd } from "@/lib/dates";

export type PeriodKey = string;

// 임계점 계산에 쓰는 과거 기간 (5년)
export const HISTORY_YEARS = 5;

// 직접 입력 지표: 기준월이 끝나고 이 날수가 지나도 입력되지 않으면 "갱신 필요"
export const MANUAL_NEEDS_UPDATE_DAYS = 28;

type Parsed = { year: number; month?: number; quarter?: number };

function parse(key: PeriodKey): Parsed {
  const [year, rest] = key.split("-");
  if (rest.startsWith("Q")) return { year: Number(year), quarter: Number(rest.slice(1)) };
  return { year: Number(year), month: Number(rest) };
}

function monthKey(year: number, month: number): PeriodKey {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function quarterKey(year: number, quarter: number): PeriodKey {
  const index = year * 4 + (quarter - 1);
  return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
}

// 날짜가 속한 기간 (일별 지표는 월로 묶는다)
export function periodOf(date: string, cycle: PublicationCycle): PeriodKey {
  const [year, month] = date.split("-").map(Number);
  return cycle === "quarterly" ? quarterKey(year, Math.ceil(month / 3)) : monthKey(year, month);
}

// 오늘 점검할 때 보는 기간: 전월. 분기 지표는 전월까지 끝난 마지막 분기
export function referencePeriod(cycle: PublicationCycle, today: string): PeriodKey {
  const [year, month] = today.split("-").map(Number);
  const prev = monthKey(year, month - 1);
  if (cycle !== "quarterly") return prev;
  const { year: y, month: m } = parse(prev);
  return m! % 3 === 0 ? quarterKey(y, m! / 3) : quarterKey(y, Math.floor(m! / 3));
}

export function shiftPeriod(key: PeriodKey, by: number): PeriodKey {
  const { year, month, quarter } = parse(key);
  return quarter ? quarterKey(year, quarter + by) : monthKey(year, month! + by);
}

// key 바로 앞의 기간 count개 (오래된 순서)
export function previousPeriods(key: PeriodKey, count: number): PeriodKey[] {
  return Array.from({ length: count }, (_, i) => shiftPeriod(key, i - count));
}

// 5년치 과거 기간 수: 월(일별 포함) 60개, 분기 20개
export function historyLength(cycle: PublicationCycle): number {
  return cycle === "quarterly" ? HISTORY_YEARS * 4 : HISTORY_YEARS * 12;
}

export function periodEnd(key: PeriodKey): string {
  const { year, month, quarter } = parse(key);
  return monthEnd(year, quarter ? quarter * 3 : month!);
}

export function periodLabel(key: PeriodKey): string {
  const { year, month, quarter } = parse(key);
  return quarter ? `${year}년 ${quarter}분기` : `${year}년 ${month}월`;
}

// 이 날까지는 값이 없어도 "발표 전"으로 본다.
// 일별: 기간이 끝난 다음 영업일 / 월·분기: 기간이 끝난 달로부터 publishLagMonths달 뒤 말일
// 직접 입력: 기간이 끝나고 MANUAL_NEEDS_UPDATE_DAYS일 뒤 (지나면 "갱신 필요")
export function publishDeadline(indicator: IndicatorDefinition, key: PeriodKey): string {
  const end = periodEnd(key);
  if (indicator.collectionMethod === "manual") return addDays(end, MANUAL_NEEDS_UPDATE_DAYS);
  if (indicator.publicationCycle === "daily") return addBusinessDays(end, 1, indicator.holidayCalendar);
  const [year, month] = end.split("-").map(Number);
  return monthEnd(year, month + indicator.publishLagMonths);
}

export type PeriodValue = { value: number; reference?: number };

// 값 목록을 기간별로 묶는다. 한 기간에 값이 여러 개면 평균을 쓴다 (일별 지표 → 기준월 평균)
export function aggregateByPeriod(
  series: ValuePoint[],
  cycle: PublicationCycle,
): Map<PeriodKey, PeriodValue> {
  const groups = new Map<PeriodKey, ValuePoint[]>();
  for (const point of series) {
    const key = periodOf(point.date, cycle);
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }

  const result = new Map<PeriodKey, PeriodValue>();
  for (const [key, points] of groups) {
    const references = points.flatMap((p) => (p.reference === undefined ? [] : [p.reference]));
    result.set(key, {
      value: average(points.map((p) => p.value)),
      reference: references.length > 0 ? average(references) : undefined,
    });
  }
  return result;
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
