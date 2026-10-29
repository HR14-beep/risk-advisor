// 지표 하나가 가질 항목 정의 (DESIGN.md §5.1, PLAN 작업 2)와 지표 목록 (PLAN 작업 3)
// 지표 목록은 "지표 참고자료.xlsx"(사용자가 정리한 파일)를 옮긴 것이다.

// 3개 분류. 값은 서버 API 주소의 [분류] 자리에도 그대로 쓴다 (DESIGN.md §6)
export const CATEGORIES = ["macro", "early-warning", "crisis-response"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  macro: "거시경제지표",
  "early-warning": "조기경보지표",
  "crisis-response": "위기대응지표",
};

// 리스크 3단계. 위험한 순서대로 둔다
export const RISK_LEVELS = ["crisis", "warning", "caution"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  crisis: "위기",
  warning: "경계",
  caution: "주의",
};

// 분류마다 쓰는 단계가 다르다 (지표 참고자료 비고: 정상/주의, 정상/경계, 정상/주의/경계/위기)
export const CATEGORY_LEVELS: Record<Category, readonly RiskLevel[]> = {
  macro: ["caution"],
  "early-warning": ["warning"],
  "crisis-response": ["crisis", "warning", "caution"],
};

export type CollectionMethod = "auto" | "manual";

// daily 지표는 기준월 평균으로 판정한다
export type PublicationCycle = "daily" | "monthly" | "quarterly";

// above: 값이 임계점 이상이면 위험 / below: 값이 임계점 이하이면 위험
export type JudgeDirection = "above" | "below";

// 임계점 산정식
// sigma: 기준 기간 앞 5년 값의 평균 ± 배수 × 표준편차 (위험한 쪽으로 더하거나 뺀다)
// reference: 기준값(목표값·담보가치 등, 매월 지표값과 함께 입력) × 비율
export type ThresholdRule =
  | { kind: "sigma"; multipliers: Partial<Record<RiskLevel, number>> }
  | { kind: "reference"; referenceName: string; ratios: Partial<Record<RiskLevel, number>> };

// 값을 확인하는 곳 (지표 참고자료 "확인위치")
export type SourceLink = { name: string; url?: string };

// 가중합 지표를 이루는 값. 각 값을 5년 평균·표준편차로 표준화한 뒤 가중치를 곱해 더한다
export type Component = {
  id: string;
  name: string;
  weight: number;
  source: SourceLink;
  description?: string;
};

// 허용 범위: 직접 입력할 때 넣을 수 있는 값의 범위. 지금은 정해진 범위가 없다
export type AllowedRange = { min: number; max: number };

// 기준일 하나의 값. 목록은 기준일 오래된 순서로 쌓는다
// reference: 임계점이 "기준값 × 비율"인 지표의 기준값 (목표값·담보가치 등)
export type ValuePoint = { date: string; value: number; reference?: number };

export type IndicatorDefinition = {
  id: string; // 지표 번호 (예: "ew_bank_delinquency")
  name: string; // 화면에 보일 이름
  category: Category;
  collectionMethod: CollectionMethod;
  unit: string; // 예: "%", "억원". 단위 없는 숫자는 ""
  source: SourceLink;
  components?: Component[]; // 있으면 가중합 지표
  publicationCycle: PublicationCycle;
  publishTiming: string; // 발표 시점 (화면 안내용 원문)
  publishLagMonths: number; // 기간이 끝난 달로부터 몇 달 뒤 말일까지 발표되는지 (daily는 쓰지 않음)
  holidayCalendar: string; // 영업일을 셀 때 쓰는 휴일 기준 국가
  direction: JudgeDirection;
  threshold: ThresholdRule;
  allowedRange?: AllowedRange;
};

const KCIF: SourceLink = { name: "국제금융센터", url: "https://www.kcif.or.kr/" };
const ECOS: SourceLink = { name: "한국은행 ECOS", url: "https://ecos.bok.or.kr/" };
const KOSIS: SourceLink = { name: "KOSIS 국가통계포털", url: "https://kosis.kr/" };
const FISIS: SourceLink = { name: "금융감독원 FISIS", url: "https://fisis.fss.or.kr/" };
const R_ONE: SourceLink = { name: "한국부동산원 R-ONE", url: "https://www.reb.or.kr/r-one" };
const REB: SourceLink = R_ONE;
// 한국부동산원이 만들어 KOSIS에 올린 자료 (R-ONE 공개 API에 없는 통계)
const KOSIS_REB: SourceLink = { name: "KOSIS (한국부동산원)", url: "https://kosis.kr/" };
const TANK_AUCTION: SourceLink = { name: "탱크옥션", url: "https://www.tankauction.com/" };
const KCLA: SourceLink = { name: "KCLA", url: "https://www.kcla.kr/" };
// 실습 단계에서는 사내 데이터 대신 가상 값을 넣는다 (PRD 7번)
const INTERNAL: SourceLink = { name: "사내 데이터 (가상 값)" };

// 조기경보지표: 정상/경계 두 단계, 5년 평균 ± 1.96σ
const EW_SIGMA: ThresholdRule = { kind: "sigma", multipliers: { warning: 1.96 } };

// 위기대응지표의 임계점 비율
const TARGET_RATIOS = { caution: 0.95, warning: 0.85, crisis: 0.75 };
const COLLATERAL_RATIOS = { caution: 1, warning: 0.9, crisis: 0.8 };

function earlyWarning(
  id: string,
  name: string,
  unit: string,
  source: SourceLink,
  publicationCycle: PublicationCycle,
  publishTiming: string,
  publishLagMonths: number,
  direction: JudgeDirection,
): IndicatorDefinition {
  return {
    id,
    name,
    category: "early-warning",
    collectionMethod: "auto",
    unit,
    source,
    publicationCycle,
    publishTiming,
    publishLagMonths,
    holidayCalendar: "KR",
    direction,
    threshold: EW_SIGMA,
  };
}

// 위기대응지표: 사내 데이터를 매월 직접 입력한다
function crisisResponse(
  id: string,
  name: string,
  unit: string,
  threshold: ThresholdRule,
): IndicatorDefinition {
  return {
    id,
    name,
    category: "crisis-response",
    collectionMethod: "manual",
    unit,
    source: INTERNAL,
    publicationCycle: "monthly",
    publishTiming: "매월 직접 입력",
    publishLagMonths: 0,
    holidayCalendar: "KR",
    direction: "below",
    threshold,
  };
}

function collateral(id: string, name: string): IndicatorDefinition {
  // 지표값(금액)을 담보가치 금액과 비교한다
  return crisisResponse(id, name, "억원", {
    kind: "reference",
    referenceName: "담보가치",
    ratios: COLLATERAL_RATIOS,
  });
}

export const INDICATORS: IndicatorDefinition[] = [
  // ── 거시경제지표 (정상/주의) — 가중합 지표
  {
    id: "macro_financial",
    name: "금융경제지표",
    category: "macro",
    collectionMethod: "auto",
    unit: "점",
    source: KCIF,
    components: [
      { id: "macro_financial.kospi", name: "KOSPI", weight: 0.2, source: KCIF },
      { id: "macro_financial.vkospi", name: "VKOSPI", weight: 0.2, source: KCIF },
      {
        id: "macro_financial.credit_spread",
        name: "신용스프레드",
        weight: 0.25,
        source: KCIF,
        description: "회사채(AA) 3년물 금리 − 국고채 3년물 금리",
      },
      { id: "macro_financial.korea_cds", name: "한국 CDS 프리미엄", weight: 0.25, source: KCIF },
      { id: "macro_financial.usd_krw", name: "원/달러 환율", weight: 0.1, source: KCIF },
    ],
    publicationCycle: "daily",
    publishTiming: "익일",
    publishLagMonths: 0,
    holidayCalendar: "KR",
    direction: "above",
    threshold: { kind: "sigma", multipliers: { caution: 1 } },
  },
  {
    id: "macro_economy",
    name: "거시경제지표",
    category: "macro",
    collectionMethod: "auto",
    unit: "점",
    source: ECOS,
    components: [
      { id: "macro_economy.consumer_sentiment", name: "소비자심리지수", weight: 0.15, source: ECOS },
      { id: "macro_economy.business_survey", name: "기업경기실사지수", weight: 0.15, source: ECOS },
      { id: "macro_economy.small_business_outlook", name: "소상공인 부문별 전망", weight: 0.35, source: KOSIS },
      { id: "macro_economy.sme_coincident", name: "중소기업 경기동행종합지수", weight: 0.35, source: KOSIS },
    ],
    publicationCycle: "monthly",
    publishTiming: "당월말",
    publishLagMonths: 0,
    holidayCalendar: "KR",
    direction: "below",
    threshold: { kind: "sigma", multipliers: { caution: 1 } },
  },

  // ── 조기경보지표 (정상/경계)
  earlyWarning("ew_household_npl", "가계 고정이하여신비율", "%", FISIS, "quarterly", "분기말 3개월 이내", 3, "above"),
  earlyWarning("ew_sme_npl", "중소기업 고정이하여신비율", "%", FISIS, "quarterly", "분기말 3개월 이내", 3, "above"),
  earlyWarning("ew_vacancy_rate", "공실률", "%", R_ONE, "quarterly", "분기말 1개월 이내", 1, "above"),
  earlyWarning("ew_large_corp_npl", "대기업 고정이하여신비율", "%", FISIS, "quarterly", "분기말 3개월 이내", 3, "above"),
  earlyWarning("ew_total_corp_npl", "전체기업 고정이하여신비율", "%", FISIS, "quarterly", "분기말 3개월 이내", 3, "above"),
  // 은행 연체율: 지표 참고자료의 확인 위치는 금감원이지만, 같은 통계를 한국은행 ECOS에서 가져온다
  earlyWarning("ew_bank_delinquency", "은행 연체율", "%", ECOS, "monthly", "2개월 후", 2, "above"),
  earlyWarning("ew_commercial_rent", "상업용 부동산 임대가격지수", "", REB, "quarterly", "분기말 1개월 후", 1, "below"),
  earlyWarning("ew_auction_rate", "낙찰가율", "%", TANK_AUCTION, "monthly", "익월 초", 1, "below"),
  earlyWarning("ew_land_price", "지가지수", "", REB, "monthly", "1개월 후", 1, "below"),
  earlyWarning("ew_bdi", "BDI", "", KCLA, "monthly", "당월말", 0, "below"),
  earlyWarning("ew_apartment_price", "아파트 실거래 매매가격지수", "", KOSIS_REB, "monthly", "2개월 후", 2, "below"),
  earlyWarning("ew_bsi", "BSI", "", ECOS, "monthly", "당월말", 0, "below"),

  // ── 위기대응지표 (정상/주의/경계/위기). 산정식 세부 자료는 받는 대로 보강한다
  crisisResponse("cr_recovery_unsecured", "채권회수율(무담보)", "%", {
    kind: "sigma",
    multipliers: { caution: 1.64, warning: 1.96, crisis: 2.58 },
  }),
  crisisResponse("cr_recovery_secured", "채권회수율(담보)", "%", {
    kind: "reference",
    referenceName: "목표값",
    ratios: TARGET_RATIOS,
  }),
  collateral("cr_recoverable_slb", "회수가능비율(S&LB)"),
  collateral("cr_recoverable_indirect", "회수가능비율(간접인수)"),
  crisisResponse("cr_fund_return", "펀드운용수익률", "%", {
    kind: "reference",
    referenceName: "기준수익률(1 − 펀드보수율 가중평균 × 운용기간 가중평균)",
    ratios: TARGET_RATIOS,
  }),
  collateral("cr_ship_collateral", "선박담보비율"),
  collateral("cr_estimated_collateral", "추정담보비율"),
  // 공공기관이라 미수금은 모두 회수 가능한 것으로 보고, 목표값 대비 낮을수록 위험으로 본다
  crisisResponse("cr_receivables", "미수금", "", {
    kind: "reference",
    referenceName: "목표값",
    ratios: TARGET_RATIOS,
  }),
];
