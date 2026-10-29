// 한국은행 경제통계시스템(ECOS) 공개 API 수집 (PLAN 작업 10~11)
// 주소 형식: https://ecos.bok.or.kr/api/StatisticSearch/{인증키}/json/kr/{시작}/{끝}/{통계표}/{주기}/{시작 기간}/{끝 기간}/{항목...}
import type { ValuePoint } from "@/lib/indicators";
import { periodEnd } from "@/lib/period";
import { CollectorError } from "@/lib/collectors/common";

export { CollectorError };

const BASE_URL = "https://ecos.bok.or.kr/api/StatisticSearch";
const TIMEOUT_MS = 10_000;
const PAGE_SIZE = 1000;

// D: 일별 (기간 "2026-10-01") / M: 월별 (기간 "2026-10")
export type EcosCycle = "D" | "M";

export type EcosQuery = {
  statCode: string; // 통계표 코드 (예: 512Y013 기업경기조사(실적))
  cycle: EcosCycle;
  itemCodes: string[]; // 항목 코드 (예: 99988 전산업, AA 업황실적BSI)
  start: string;
  end: string;
};

type EcosRow = { TIME: string; DATA_VALUE: string };
type EcosResponse = {
  StatisticSearch?: { list_total_count?: number; row?: EcosRow[] };
  RESULT?: { CODE: string; MESSAGE: string };
};

// "20261001" → "2026-10-01", "202608" → 그 달 말일
function toDate(time: string, cycle: EcosCycle): string | null {
  if (cycle === "D") return /^\d{8}$/.test(time) ? `${time.slice(0, 4)}-${time.slice(4, 6)}-${time.slice(6)}` : null;
  return /^\d{6}$/.test(time) ? periodEnd(`${time.slice(0, 4)}-${time.slice(4)}`) : null;
}

// ECOS 응답을 기준일 순서의 값 목록으로 바꾼다
export function parseEcos(body: EcosResponse, cycle: EcosCycle): ValuePoint[] {
  if (body.RESULT) {
    // INFO-200: 해당하는 데이터가 없음 → 빈 목록
    if (body.RESULT.CODE === "INFO-200") return [];
    throw new CollectorError(`한국은행 ECOS 오류 (${body.RESULT.CODE}): ${body.RESULT.MESSAGE.split("\n")[0]}`);
  }
  return (body.StatisticSearch?.row ?? [])
    .flatMap((row) => {
      const date = toDate(row.TIME, cycle);
      const value = Number(row.DATA_VALUE);
      if (!date || row.DATA_VALUE.trim() === "" || !Number.isFinite(value)) return [];
      return [{ date, value }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchPage(query: EcosQuery, key: string, from: number): Promise<EcosResponse> {
  const path = [
    encodeURIComponent(key),
    "json/kr",
    from,
    from + PAGE_SIZE - 1,
    query.statCode,
    query.cycle,
    query.start.replaceAll("-", ""),
    query.end.replaceAll("-", ""),
    ...query.itemCodes,
  ].join("/");

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new CollectorError("한국은행 ECOS에 연결하지 못했습니다");
  }
  if (!response.ok) throw new CollectorError(`한국은행 ECOS 응답 오류 (${response.status})`);
  return (await response.json()) as EcosResponse;
}

// 일별 값은 6년이면 1,500줄이 넘으므로 1,000줄씩 나눠 받는다
export async function fetchEcos(query: EcosQuery): Promise<ValuePoint[]> {
  const key = process.env.ECOS_API_KEY;
  if (!key) throw new CollectorError("ECOS_API_KEY가 .env에 없습니다");

  const points: ValuePoint[] = [];
  for (let from = 1; ; from += PAGE_SIZE) {
    const body = await fetchPage(query, key, from);
    points.push(...parseEcos(body, query.cycle));
    const total = body.StatisticSearch?.list_total_count ?? 0;
    if (from + PAGE_SIZE - 1 >= total) break;
  }
  return points;
}

// 같은 기준일끼리 a − b (예: 신용스프레드 = 회사채 금리 − 국고채 금리). 한쪽에만 있는 날은 뺀다
export function subtractByDate(a: ValuePoint[], b: ValuePoint[]): ValuePoint[] {
  const bByDate = new Map(b.map((p) => [p.date, p.value]));
  return a.flatMap((p) => {
    const other = bByDate.get(p.date);
    return other === undefined ? [] : [{ date: p.date, value: Math.round((p.value - other) * 1e6) / 1e6 }];
  });
}
