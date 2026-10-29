// 자동 수집 범위 정하기와 값 합치기 (DESIGN.md §4.1, PLAN 작업 12)
// 저장소에 과거 값이 이미 쌓여 있으면 최근 값만 새로 가져와, 화면을 열 때마다 6년치를 다시 받지 않는다.
import type { ValuePoint } from "@/lib/indicators";
import { addDays } from "@/lib/dates";

// 최근 값은 발표 기관이 고치는 경우가 있어(잠정치 → 확정치) 마지막 저장일보다 이만큼 앞부터 다시 받는다
export const REVISION_DAYS = 62;

// 저장된 값이 수집해야 할 기간의 처음까지 닿아 있다고 볼 여유 (월 값은 그 달 말일에 저장되므로)
const COVERAGE_SLACK_DAYS = 31;

// fullStart: 전체 수집 시작일 ("YYYY-MM-DD"). 저장된 값이 이 날 근처부터 있으면 최근 값만 가져온다
export function collectStart(stored: ValuePoint[], fullStart: string): string {
  const first = stored[0]?.date;
  const last = stored.at(-1)?.date;
  if (!first || !last || first > addDays(fullStart, COVERAGE_SLACK_DAYS)) return fullStart;
  const recent = addDays(last, -REVISION_DAYS);
  return recent > fullStart ? recent : fullStart;
}

// 저장된 값에 새로 수집한 값을 덮어 합친다 (같은 기준일은 새 값이 이긴다)
export function mergeSeries(stored: ValuePoint[], collected: ValuePoint[]): ValuePoint[] {
  const byDate = new Map(stored.map((p) => [p.date, p]));
  for (const point of collected) byDate.set(point.date, point);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
