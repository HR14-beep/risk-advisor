// 금융감독원 금융통계정보시스템(FISIS) 공개 API 수집 (PLAN 작업 11)
// 고정이하여신비율은 은행별로만 제공되므로, 국내은행(문 닫은 은행 제외) 값을 모두 더해
// 국내은행 전체 비율 = 고정이하여신 합계 ÷ 총여신 합계 × 100 으로 계산한다.
// (금감원 보도자료의 국내은행 합계와 은행 범위가 조금 다를 수 있다)
import type { ValuePoint } from "@/lib/indicators";
import { CollectorError, fetchJson, memoize, monthKeyToDate, requireKey } from "@/lib/collectors/common";

const BASE_URL = "https://fisis.fss.or.kr/openapi";
const SOURCE = "금융감독원 FISIS";
const NPL_LIST = "SA041"; // 여신건전성(여신종별 고정이하여신)

// 여신 종류 (FISIS 계정 코드)
export const NPL_ACCOUNTS = {
  household: "B", // 가계여신
  sme: "A2", // 기업여신_중소기업
  largeCorp: "A1", // 기업여신_대기업
  totalCorp: "A", // 기업여신
} as const;

type FisisResult<T> = { result?: { err_cd: string; err_msg: string; list?: T[] } };
type Company = { finance_cd: string; finance_nm: string };
type NplRow = { base_month: string; account_cd: string; a: string; b: string };

function unwrap<T>(body: unknown): T[] {
  const result = (body as FisisResult<T>).result;
  if (!result) throw new CollectorError(`${SOURCE} 응답을 읽지 못했습니다`);
  if (result.err_cd !== "000") throw new CollectorError(`${SOURCE} 오류 (${result.err_cd}): ${result.err_msg}`);
  return result.list ?? [];
}

async function activeBanks(key: string): Promise<Company[]> {
  const body = await fetchJson(`${BASE_URL}/companySearch.json?lang=kr&auth=${key}&partDiv=A`, SOURCE);
  return unwrap<Company>(body).filter((c) => !c.finance_nm.includes("[폐]"));
}

// 은행별 줄을 계정·분기별로 더해 비율로 바꾼다
export function sumNplRatios(rows: NplRow[]): Record<string, ValuePoint[]> {
  const sums = new Map<string, { total: number; npl: number }>();
  for (const row of rows) {
    const total = Number(row.a);
    const npl = Number(row.b);
    if (!Number.isFinite(total) || !Number.isFinite(npl)) continue;
    const key = `${row.account_cd}/${row.base_month}`;
    const sum = sums.get(key) ?? { total: 0, npl: 0 };
    sums.set(key, { total: sum.total + total, npl: sum.npl + npl });
  }
  const result: Record<string, ValuePoint[]> = {};
  for (const [key, { total, npl }] of sums) {
    const [account, month] = key.split("/");
    const date = monthKeyToDate(month);
    if (!date || total <= 0) continue;
    (result[account] ??= []).push({ date, value: Math.round((npl / total) * 100 * 1e4) / 1e4 });
  }
  for (const points of Object.values(result)) points.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

// key: "시작월|끝월" (예: "202009|202610")
const fetchNplRatios = memoize(async (range: string) => {
  const [startMonth, endMonth] = range.split("|");
  const key = requireKey("FISIS_API_KEY");
  const banks = await activeBanks(key);
  const perBank = await Promise.all(
    banks.map(async (bank) =>
      unwrap<NplRow>(
        await fetchJson(
          `${BASE_URL}/statisticsInfoSearch.json?lang=kr&auth=${key}&financeCd=${bank.finance_cd}&listNo=${NPL_LIST}&term=Q&startBaseMm=${startMonth}&endBaseMm=${endMonth}`,
          SOURCE,
        ),
      ),
    ),
  );
  return sumNplRatios(perBank.flat());
});

export async function fetchNplRatio(account: string, start: string, today: string): Promise<ValuePoint[]> {
  const ratios = await fetchNplRatios(`${start.slice(0, 7).replace("-", "")}|${today.slice(0, 7).replace("-", "")}`);
  return ratios[account] ?? [];
}
