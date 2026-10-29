// KOSIS 국가통계포털 공개 API 수집 (PLAN 작업 11)
// 주소: https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList&apiKey=…&orgId=…&tblId=…&itmId=…&objL1=…
import type { ValuePoint } from "@/lib/indicators";
import { CollectorError, fetchJson, monthKeyToDate, requireKey } from "@/lib/collectors/common";

const BASE_URL = "https://kosis.kr/openapi/Param/statisticsParameterData.do";
const SOURCE = "KOSIS";

export type KosisQuery = {
  orgId: string; // 작성기관
  tblId: string; // 통계표
  itmId: string; // 항목
  objL1: string; // 분류
  start: string; // "YYYY-MM-DD"
  end: string;
};

type KosisRow = { PRD_DE: string; DT: string };

// 정상이면 줄 목록, 오류면 { err, errMsg }
export function parseKosis(body: unknown): ValuePoint[] {
  if (!Array.isArray(body)) {
    const { err, errMsg } = (body ?? {}) as { err?: string; errMsg?: string };
    // 30: 데이터가 없음
    if (err === "30") return [];
    throw new CollectorError(`${SOURCE} 오류 (${err ?? "?"}): ${errMsg ?? "응답을 읽지 못했습니다"}`);
  }
  return (body as KosisRow[])
    .flatMap((row) => {
      const date = monthKeyToDate(row.PRD_DE);
      const value = Number(row.DT);
      return date && row.DT !== "" && Number.isFinite(value) ? [{ date, value }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchKosisMonthly(query: KosisQuery): Promise<ValuePoint[]> {
  const key = requireKey("KOSIS_API_KEY");
  const month = (date: string) => date.slice(0, 7).replace("-", "");
  const url =
    `${BASE_URL}?method=getList&apiKey=${encodeURIComponent(key)}&format=json&jsonVD=Y&prdSe=M` +
    `&orgId=${query.orgId}&tblId=${query.tblId}&itmId=${query.itmId}&objL1=${query.objL1}` +
    `&startPrdDe=${month(query.start)}&endPrdDe=${month(query.end)}`;
  return parseKosis(await fetchJson(url, SOURCE));
}
