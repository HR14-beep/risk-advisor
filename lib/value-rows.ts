// 지표 값 ↔ 저장소 indicator_values 표의 한 줄 바꾸기 (DESIGN.md §5.2)
import type { CollectionMethod, ValuePoint } from "@/lib/indicators";
import type { SeriesById } from "@/lib/judge";

export const VALUES_TABLE = "indicator_values";

// 저장소 표의 한 줄
export type ValueRow = {
  indicator_id: string;
  value: number | null;
  reference: number | null;
  value_date: string;
  collection_method: CollectionMethod;
  success: boolean;
};

export function toValueRows(
  indicatorId: string,
  points: ValuePoint[],
  method: CollectionMethod,
): ValueRow[] {
  return points.map((point) => ({
    indicator_id: indicatorId,
    value: point.value,
    reference: point.reference ?? null,
    value_date: point.date,
    collection_method: method,
    success: true,
  }));
}

// 읽어 온 줄을 지표별 값 목록(기준일 오래된 순서)으로 묶는다. 수집에 실패한 기록은 뺀다
export function rowsToSeries(rows: ValueRow[]): SeriesById {
  const series: SeriesById = {};
  for (const row of rows) {
    if (!row.success || row.value === null) continue;
    const point: ValuePoint = { date: row.value_date, value: Number(row.value) };
    if (row.reference !== null) point.reference = Number(row.reference);
    (series[row.indicator_id] ??= []).push(point);
  }
  for (const points of Object.values(series)) points.sort((a, b) => a.date.localeCompare(b.date));
  return series;
}
