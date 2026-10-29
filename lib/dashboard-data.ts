// 지표 현황에 쓸 값 모으기 (DESIGN.md §4.1, PLAN 작업 10~12)
// 화면을 열면: 저장소에서 과거 값 불러오기 → 새 값만 수집 → 수집값 저장 → 판정에 쓸 값 합치기
// 저장소에도 수집한 값도 없는 지표는 실습용 가상 값을 그대로 쓴다 (자동 수집을 모두 붙이면 없앤다).
import "server-only";
import { INDICATORS, type ValuePoint } from "@/lib/indicators";
import type { SeriesById } from "@/lib/judge";
import { addDays, monthEnd } from "@/lib/dates";
import { COLLECTORS, fullCollectStart, type Collector } from "@/lib/collectors";
import { collectStart, mergeSeries } from "@/lib/collect-plan";
import { sampleSeries } from "@/lib/sample-values";
import { StoreConfigError } from "@/lib/supabase";
import { loadSeries, recordFailure, saveValues } from "@/lib/value-store";
import { hasHolidayList } from "@/lib/holidays";

export type DashboardData = {
  series: SeriesById;
  sampleIds: Set<string>; // 가상 값으로 보여 주는 지표
  failedIds: Set<string>; // 이번 수집에 실패해 저장된 직전 값으로 보여 주는 지표
  notices: string[]; // 화면 위에 보여 줄 안내 (수집·저장소 문제)
};

// 지표 번호·구성값 번호 → 화면에 보일 이름
const SERIES_NAMES = new Map(
  INDICATORS.flatMap((i) =>
    i.components ? i.components.map((c) => [c.id, `${i.name} · ${c.name}`] as const) : [[i.id, i.name] as const],
  ),
);
const SERIES_IDS = [...SERIES_NAMES.keys()];

async function loadStored(today: string, notices: string[]): Promise<SeriesById> {
  try {
    // 7년 전부터: 5년 임계점 + 직전 발표 값 여유
    const [year, month] = today.split("-").map(Number);
    return await loadSeries(SERIES_IDS, addDays(monthEnd(year - 7, month), 1));
  } catch (error) {
    console.error(error);
    notices.push(
      error instanceof StoreConfigError
        ? error.message
        : "저장소에 연결하지 못했어요. 저장된 값 없이 새로 수집한 값과 가상 값으로 보여 줍니다.",
    );
    return {};
  }
}

// 저장된 값 다음부터 새로 수집하고 저장한다. 수집에 성공한 값과 실패한 번호를 돌려준다
async function collectNew(
  today: string,
  stored: SeriesById,
  notices: string[],
): Promise<{ collected: SeriesById; failed: Set<string> }> {
  const fullStart = fullCollectStart(today);
  // 같은 수집 방법·같은 시작일은 한 번만 부른다 (예: BSI는 두 지표에 쓰인다)
  const calls = new Map<Collector, Map<string, Promise<ValuePoint[]>>>();
  const call = (collector: Collector, start: string) => {
    const byStart = calls.get(collector) ?? new Map<string, Promise<ValuePoint[]>>();
    calls.set(collector, byStart);
    if (!byStart.has(start)) byStart.set(start, collector.collect(start, today));
    return byStart.get(start)!;
  };

  // 같은 이유로 실패한 값은 한 줄로 묶어 알린다 (예: 인증키가 없을 때)
  const failures = new Map<string, string[]>();
  const results = await Promise.all(
    Object.entries(COLLECTORS).map(async ([id, collector]): Promise<[string, ValuePoint[]] | null> => {
      let points: ValuePoint[];
      try {
        points = await call(collector, collectStart(stored[id] ?? [], fullStart));
      } catch (error) {
        console.error(error);
        const reason = `${collector.sourceName}에서 값을 가져오지 못했어요 (${(error as Error).message})`;
        failures.set(reason, [...(failures.get(reason) ?? []), SERIES_NAMES.get(id) ?? id]);
        // 실패 기록을 남긴다. 그날 이미 저장된 값은 지우지 않는다 (저장소가 없으면 건너뛴다)
        await recordFailure(id, today).catch(() => undefined);
        return null;
      }
      try {
        await saveValues(id, points, "auto");
      } catch (error) {
        // 저장에 실패해도 이번에 수집한 값으로 화면은 보여 준다
        console.error(error);
      }
      return [id, points];
    }),
  );
  for (const [reason, names] of failures) notices.push(`${reason}: ${names.join(", ")}`);
  const collected = Object.fromEntries(results.filter((r) => r !== null));
  return { collected, failed: new Set(Object.keys(COLLECTORS).filter((id) => !(id in collected))) };
}

export async function loadDashboardData(today: string): Promise<DashboardData> {
  const notices: string[] = [];
  if (!hasHolidayList(today)) {
    notices.push(`${today.slice(0, 4)}년 휴일 목록이 없어 일별 지표의 발표 기한을 주말만 빼고 계산해요. lib/holidays.ts에 올해 휴일을 추가해 주세요.`);
  }
  const stored = await loadStored(today, notices);
  const { collected, failed } = await collectNew(today, stored, notices);

  // 가중합 지표는 구성값이 모두 실제 값일 때만 실제 값으로 판정하고, 하나라도 없으면 가상 값으로 보여 준다
  const samples = sampleSeries(today);
  const series: SeriesById = {};
  const sampleIds = new Set<string>();
  const failedIds = new Set<string>();
  for (const indicator of INDICATORS) {
    const ids = indicator.components?.map((c) => c.id) ?? [indicator.id];
    const real = Object.fromEntries(ids.map((id) => [id, mergeSeries(stored[id] ?? [], collected[id] ?? [])]));
    // 구성값마다 실제 값이 있거나, 수집기는 있는데 이번에 실패한 경우만 "실제 지표"로 본다.
    // 수집기가 없는 구성값(예: VKOSPI)이 하나라도 있으면 지표 전체를 가상 값으로 보여 준다
    const realOrFailed = ids.every((id) => real[id].length > 0 || failed.has(id));
    if (realOrFailed && ids.some((id) => failed.has(id))) {
      // 수집에 실패하면 저장된 값이 없어도 가상 값으로 채우지 않고 "수집 실패"로 보여 준다 (DESIGN.md §8)
      failedIds.add(indicator.id);
      for (const id of ids) series[id] = real[id];
      continue;
    }
    const allReal = ids.every((id) => real[id].length > 0);
    if (!allReal) sampleIds.add(indicator.id);
    for (const id of ids) series[id] = allReal ? real[id] : (samples[id] ?? []);
  }

  return { series, sampleIds, failedIds, notices };
}
