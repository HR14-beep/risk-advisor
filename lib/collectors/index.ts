// 자동 수집 지표별 수집 방법 (PLAN 작업 10~11)
// 키는 지표 번호 또는 가중합 구성값 번호다. 한국은행 ECOS·금감원 FISIS·부동산원 R-ONE·KOSIS 공개 API를 쓴다.
import "server-only";
import type { ValuePoint } from "@/lib/indicators";
import { HISTORY_YEARS, previousPeriods, referencePeriod } from "@/lib/period";
import { fetchEcos, subtractByDate } from "@/lib/collectors/ecos";
import { NPL_ACCOUNTS, fetchNplRatio } from "@/lib/collectors/fisis";
import { fetchKosisMonthly } from "@/lib/collectors/kosis";
import { fetchRone } from "@/lib/collectors/rone";

export { CollectorError } from "@/lib/collectors/common";

// start: 이 날부터 오늘까지 가져온다 ("YYYY-MM-DD")
export type Collector = {
  sourceName: string;
  collect: (start: string, today: string) => Promise<ValuePoint[]>;
};

// 처음 수집할 때의 시작일: 기준월 앞 5년 + 직전 대비·직전 발표 값을 볼 수 있도록 1년을 더 가져온다
export function fullCollectStart(today: string): string {
  const [start] = previousPeriods(referencePeriod("monthly", today), (HISTORY_YEARS + 1) * 12);
  return `${start}-01`;
}

function ecosMonthly(statCode: string, itemCodes: string[]): Collector {
  return {
    sourceName: "한국은행 ECOS",
    collect: (start, today) =>
      fetchEcos({ statCode, cycle: "M", itemCodes, start: start.slice(0, 7), end: today.slice(0, 7) }),
  };
}

function ecosDaily(statCode: string, itemCodes: string[]): Collector {
  return {
    sourceName: "한국은행 ECOS",
    collect: (start, today) => fetchEcos({ statCode, cycle: "D", itemCodes, start, end: today }),
  };
}

const GOV_BOND_3Y = ecosDaily("817Y002", ["010200000"]); // 시장금리(일별) · 국고채(3년)
const CORP_BOND_3Y = ecosDaily("817Y002", ["010300000"]); // 시장금리(일별) · 회사채(3년, AA-)
function kosisMonthly(orgId: string, tblId: string, itmId: string, objL1: string): Collector {
  return {
    sourceName: "KOSIS",
    collect: (start, today) => fetchKosisMonthly({ orgId, tblId, itmId, objL1, start, end: today }),
  };
}

function npl(account: string): Collector {
  return { sourceName: "금융감독원 FISIS", collect: (start, today) => fetchNplRatio(account, start, today) };
}

const BSI = ecosMonthly("512Y013", ["99988", "AA"]); // 기업경기조사(실적) · 전산업 · 업황실적BSI

export const COLLECTORS: Record<string, Collector> = {
  // 조기경보지표
  ew_bsi: BSI,
  // 고정이하여신비율: 국내은행 은행별 값을 더해 계산 (분기)
  ew_household_npl: npl(NPL_ACCOUNTS.household),
  ew_sme_npl: npl(NPL_ACCOUNTS.sme),
  ew_large_corp_npl: npl(NPL_ACCOUNTS.largeCorp),
  ew_total_corp_npl: npl(NPL_ACCOUNTS.totalCorp),
  // 은행 연체율: 예금은행 지역별 연체율 · 원화대출금 연체율(1개월 이상) · 전국 (월)
  ew_bank_delinquency: ecosMonthly("141Y005", ["R8AB00", "X00"]),
  // 지가지수: (월) 지역별 지가지수 · 전국
  ew_land_price: {
    sourceName: "한국부동산원 R-ONE",
    collect: (start, today) => fetchRone({ statblId: "A_2024_00901", cycle: "MM", clsId: 500001, start, end: today }),
  },
  // 아파트 실거래 매매가격지수: R-ONE 공개 API에는 없어 KOSIS에 올라온 한국부동산원 자료를 쓴다 (아파트 매매 실거래가격지수 · 전국)
  ew_apartment_price: kosisMonthly("408", "DT_KAB_11672_S1", "T1", "000"),

  // 금융경제지표 구성값 (VKOSPI, 한국 CDS 프리미엄은 ECOS에 없어 아직 연결하지 못했다)
  "macro_financial.kospi": ecosDaily("802Y001", ["0001000"]), // 주식시장(일) · KOSPI지수
  "macro_financial.usd_krw": ecosDaily("731Y001", ["0000001"]), // 원/미국달러(매매기준율)
  // 신용스프레드: ECOS에는 회사채 AA 대신 AA-가 있어 AA-로 계산한다
  "macro_financial.credit_spread": {
    sourceName: "한국은행 ECOS",
    collect: async (start, today) => {
      const [corp, gov] = await Promise.all([CORP_BOND_3Y.collect(start, today), GOV_BOND_3Y.collect(start, today)]);
      return subtractByDate(corp, gov);
    },
  },

  // 거시경제지표 구성값
  // 소상공인 부문별 전망: 소상공인시장경기동향조사 · 부문별 실적 및 전망 · 전망 · 경기전반
  "macro_economy.small_business_outlook": kosisMonthly("142", "DT_S0001N_001", "s1", "00"),
  "macro_economy.consumer_sentiment": ecosMonthly("511Y002", ["FME", "99988"]), // 소비자동향조사 · 소비자심리지수 · 전체
  "macro_economy.business_survey": BSI, // 기업경기실사지수: 조기경보지표 BSI와 같은 값
  // 중소기업 경기동행종합지수 (KOSIS · 중소벤처기업연구원 · 동행종합지수)
  "macro_economy.sme_coincident": kosisMonthly("303", "DT_303005_CI001", "T001", "00"),
};
