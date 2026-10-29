// 한국부동산원 부동산통계(R-ONE) 공개 API 수집 (PLAN 작업 11)
// 주소: https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do?KEY=…&Type=json&STATBL_ID=…&DTACYCLE_CD=…&CLS_ID=…
import type { ValuePoint } from "@/lib/indicators";
import { CollectorError, fetchJson, monthKeyToDate, quarterToDate, requireKey } from "@/lib/collectors/common";

const BASE_URL = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do";
const SOURCE = "한국부동산원 R-ONE";
const PAGE_SIZE = 1000;

export type RoneQuery = {
  statblId: string; // 통계표 번호
  cycle: "MM" | "QY";
  clsId: number; // 지역 (예: 전국)
  start: string; // "YYYY-MM-DD"
  end: string;
};

type RoneRow = { WRTTIME_IDTFR_ID: string; DTA_VAL: number | string | null };
type RoneBody = {
  SttsApiTblData?: [{ head: [{ list_total_count: number }, { RESULT: { CODE: string; MESSAGE: string } }] }, { row?: RoneRow[] }?];
  RESULT?: { CODE: string; MESSAGE: string };
};

// 기간 표기: 월 "202608" / 분기 "202402"(2분기)
function toDate(id: string, cycle: RoneQuery["cycle"]): string | null {
  if (cycle === "MM") return monthKeyToDate(id);
  return /^\d{6}$/.test(id) ? quarterToDate(id.slice(0, 4), Number(id.slice(4))) : null;
}

export function parseRone(body: RoneBody, cycle: RoneQuery["cycle"]): { points: ValuePoint[]; total: number } {
  const result = body.RESULT ?? body.SttsApiTblData?.[0].head[1].RESULT;
  // INFO-200: 해당하는 데이터가 없음
  if (result?.CODE === "INFO-200") return { points: [], total: 0 };
  if (!body.SttsApiTblData || (result && result.CODE !== "INFO-000")) {
    throw new CollectorError(`${SOURCE} 오류 (${result?.CODE ?? "?"}): ${result?.MESSAGE ?? "응답을 읽지 못했습니다"}`);
  }
  const points = (body.SttsApiTblData[1]?.row ?? []).flatMap((row) => {
    const date = toDate(row.WRTTIME_IDTFR_ID, cycle);
    const value = Number(row.DTA_VAL);
    return date && row.DTA_VAL !== null && Number.isFinite(value) ? [{ date, value }] : [];
  });
  return { points, total: body.SttsApiTblData[0].head[0].list_total_count };
}

export async function fetchRone(query: RoneQuery): Promise<ValuePoint[]> {
  const key = requireKey("REB_API_KEY");
  const points: ValuePoint[] = [];
  for (let page = 1; ; page++) {
    const url = `${BASE_URL}?KEY=${key}&Type=json&STATBL_ID=${query.statblId}&DTACYCLE_CD=${query.cycle}&CLS_ID=${query.clsId}&pIndex=${page}&pSize=${PAGE_SIZE}`;
    const { points: pagePoints, total } = parseRone((await fetchJson(url, SOURCE)) as RoneBody, query.cycle);
    points.push(...pagePoints);
    if (page * PAGE_SIZE >= total) break;
  }
  return points
    .filter((p) => p.date >= query.start && p.date <= query.end.slice(0, 7) + "-31")
    .sort((a, b) => a.date.localeCompare(b.date));
}
