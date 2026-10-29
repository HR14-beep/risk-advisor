// 실습용 가상 값 (PLAN 작업 6). 자동 수집(작업 10~12)과 저장소(작업 8~9)를 붙이면 이 파일 대신 실제 값을 쓴다.
// 기준 기간을 오늘 기준으로 잡기 때문에 언제 열어도 위기·경계·주의·정상·발표 전·데이터 없음이 골고루 보인다.
// 일별 지표(금융경제지표 구성값)도 간단하게 달마다 값 하나만 만든다. 판정은 어차피 기준월 평균으로 한다.
import { INDICATORS, type IndicatorDefinition, type PublicationCycle, type ValuePoint } from "@/lib/indicators";
import { mean, standardDeviation, type SeriesById } from "@/lib/judge";
import { historyLength, periodEnd, referencePeriod, shiftPeriod } from "@/lib/period";

// 항상 같은 값이 나오는 −1~1 사이 흔들림
function noise(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

type SigmaSpec = {
  base: number;
  amp: number;
  // 기준 기간을 0으로 센 위치 → 앞 5년 값 기준 표준점수(z). 이 값으로 단계를 정해 둔다
  z: Record<number, number>;
  last: 0 | -1; // -1이면 기준 기간 값이 아직 없다 (발표 전·데이터 없음 예시)
};

function sigmaSeries(cycle: PublicationCycle, today: string, seed: number, spec: SigmaSpec): ValuePoint[] {
  const n = historyLength(cycle);
  const ref = referencePeriod(cycle, today);
  // 직전 대비 계산과 직전 발표 값 판정까지 할 수 있도록 5년보다 넉넉히 만든다
  const first = -(n + 14);
  const offsets = Array.from({ length: spec.last - first + 1 }, (_, i) => first + i);
  const values = offsets.map((_, i) => spec.base + spec.amp * noise(seed, i));

  for (const [offset, z] of Object.entries(spec.z).sort(([a], [b]) => Number(a) - Number(b))) {
    const index = Number(offset) - first;
    const window = values.slice(index - n, index);
    values[index] = mean(window) + z * standardDeviation(window);
  }

  return offsets.map((offset, i) => ({
    date: periodEnd(shiftPeriod(ref, offset)),
    value: Math.round(values[i] * 100) / 100,
  }));
}

// 임계점이 "기준값 × 비율"인 직접 입력 지표: 최근 6개월만 만든다
function referenceSeries(today: string, reference: number, ratio: number, last: 0 | -1): ValuePoint[] {
  const ref = referencePeriod("monthly", today);
  return Array.from({ length: 6 + last }, (_, i) => {
    const offset = i - 5;
    const r = offset === 0 ? ratio : 1 + 0.04 * noise(reference, i);
    return {
      date: periodEnd(shiftPeriod(ref, offset)),
      value: Math.round(reference * r * 100) / 100,
      reference,
    };
  });
}

const SIGMA_SPECS: Record<string, SigmaSpec> = {
  // 조기경보지표
  ew_household_npl: { base: 0.3, amp: 0.05, z: { [-1]: 2.5 }, last: -1 }, // 발표 전 (직전 분기 경계)
  ew_sme_npl: { base: 0.6, amp: 0.1, z: { [-1]: 0 }, last: -1 }, // 발표 전
  ew_vacancy_rate: { base: 13, amp: 1.5, z: { 0: 2.2 }, last: 0 }, // 경계
  ew_large_corp_npl: { base: 0.5, amp: 0.1, z: { [-1]: 0.5 }, last: -1 }, // 발표 전
  ew_total_corp_npl: { base: 0.55, amp: 0.1, z: { [-1]: 0.8 }, last: -1 }, // 발표 전
  ew_bank_delinquency: { base: 0.4, amp: 0.08, z: { [-1]: 1 }, last: -1 }, // 발표 전
  ew_commercial_rent: { base: 100, amp: 2, z: { 0: -0.5 }, last: 0 }, // 정상
  ew_auction_rate: { base: 85, amp: 5, z: { 0: -2.4 }, last: 0 }, // 경계
  ew_land_price: { base: 105, amp: 3, z: { 0: 0.4 }, last: 0 }, // 정상
  ew_bdi: { base: 1500, amp: 300, z: {}, last: -1 }, // 데이터 없음 (발표 시점이 지났는데 값 없음)
  ew_apartment_price: { base: 110, amp: 4, z: { [-1]: -0.3 }, last: -1 }, // 발표 전
  ew_bsi: { base: 90, amp: 6, z: { 0: -1 }, last: 0 }, // 정상
  // 위기대응지표
  cr_recovery_unsecured: { base: 40, amp: 5, z: { 0: -2.7 }, last: 0 }, // 위기
};

// 가중합 지표의 구성값: 기준 기간 표준점수
const COMPONENT_Z: Record<string, number> = {
  macro_financial: 1.5, // 주의
  macro_economy: 0.3, // 정상
};

const COMPONENT_BASES: Record<string, { base: number; amp: number }> = {
  "macro_financial.kospi": { base: 2600, amp: 200 },
  "macro_financial.vkospi": { base: 20, amp: 4 },
  "macro_financial.credit_spread": { base: 0.7, amp: 0.15 },
  "macro_financial.korea_cds": { base: 30, amp: 8 },
  "macro_financial.usd_krw": { base: 1350, amp: 60 },
  "macro_economy.consumer_sentiment": { base: 98, amp: 6 },
  "macro_economy.business_survey": { base: 85, amp: 7 },
  "macro_economy.small_business_outlook": { base: 75, amp: 8 },
  "macro_economy.sme_coincident": { base: 100, amp: 3 },
};

// [기준값, 기준 기간 값 ÷ 기준값]. 비율이 없으면 기준 기간 값을 아직 입력하지 않은 예시
const REFERENCE_SPECS: Record<string, [number, number | null]> = {
  cr_recovery_secured: [80, 0.9], // 주의
  cr_recoverable_slb: [500, 1.05], // 정상
  cr_recoverable_indirect: [300, 0.88], // 경계
  cr_fund_return: [4, 1.02], // 정상
  cr_ship_collateral: [800, 1.1], // 정상
  cr_estimated_collateral: [600, null], // 발표 전
  cr_receivables: [50, 0.7], // 위기
};

function indicatorSeries(indicator: IndicatorDefinition, today: string, seed: number): SeriesById {
  const { id, publicationCycle } = indicator;

  if (indicator.components) {
    return Object.fromEntries(
      indicator.components.map((component, i) => [
        component.id,
        sigmaSeries(publicationCycle, today, seed * 10 + i, {
          ...COMPONENT_BASES[component.id],
          z: { 0: COMPONENT_Z[id] },
          last: 0,
        }),
      ]),
    );
  }

  if (id in REFERENCE_SPECS) {
    const [reference, ratio] = REFERENCE_SPECS[id];
    return { [id]: referenceSeries(today, reference, ratio ?? 1, ratio === null ? -1 : 0) };
  }

  return { [id]: sigmaSeries(publicationCycle, today, seed, SIGMA_SPECS[id]) };
}

export function sampleSeries(today: string): SeriesById {
  return Object.assign({}, ...INDICATORS.map((indicator, i) => indicatorSeries(indicator, today, i + 1)));
}
