// 지표 값 저장하고 불러오기 (DESIGN.md §4.1, §5.2, PLAN 작업 8)
// 직접 입력(작업 9)과 자동 수집(작업 10~12)이 이 함수들로 저장소를 쓴다.
import "server-only";
import type { CollectionMethod, ValuePoint } from "@/lib/indicators";
import type { SeriesById } from "@/lib/judge";
import { getSupabase } from "@/lib/supabase";
import { rowsToSeries, toValueRows, VALUES_TABLE, type ValueRow } from "@/lib/value-rows";

// 저장소가 한 번에 돌려주는 최대 줄 수 (Supabase 기본값). 넘으면 나눠 읽는다
const PAGE_SIZE = 1000;

export class StoreError extends Error {
  constructor(action: string, cause: { message: string }) {
    super(`저장소에서 ${action}하지 못했습니다: ${cause.message}`);
    this.name = "StoreError";
  }
}

// ids 지표(또는 구성값)의 since 이후 값을 불러온다. 5년 임계점 계산을 위해 since는 기준 기간보다 5년 넘게 앞으로 잡는다
export async function loadSeries(ids: string[], since: string): Promise<SeriesById> {
  const rows: ValueRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await getSupabase()
      .from(VALUES_TABLE)
      .select("indicator_id, value, reference, value_date, collection_method, success")
      .in("indicator_id", ids)
      .gte("value_date", since)
      .order("value_date")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new StoreError("값을 불러오", error);
    rows.push(...(data as ValueRow[]));
    if (data.length < PAGE_SIZE) break;
  }
  return rowsToSeries(rows);
}

// 값을 저장한다. 같은 지표·기준일 값이 이미 있으면 새 값으로 덮어쓴다
export async function saveValues(
  indicatorId: string,
  points: ValuePoint[],
  method: CollectionMethod,
): Promise<void> {
  if (points.length === 0) return;
  const { error } = await getSupabase()
    .from(VALUES_TABLE)
    .upsert(toValueRows(indicatorId, points, method), { onConflict: "indicator_id,value_date" });
  if (error) throw new StoreError("값을 저장", error);
}

// 수집 실패를 기록한다. 그 기준일에 이미 저장된 값이 있으면 지우지 않고 그대로 둔다
export async function recordFailure(indicatorId: string, date: string): Promise<void> {
  const row: ValueRow = {
    indicator_id: indicatorId,
    value: null,
    reference: null,
    value_date: date,
    collection_method: "auto",
    success: false,
  };
  const { error } = await getSupabase()
    .from(VALUES_TABLE)
    .upsert(row, { onConflict: "indicator_id,value_date", ignoreDuplicates: true });
  if (error) throw new StoreError("수집 실패를 기록", error);
}
