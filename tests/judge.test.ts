import { describe, expect, it } from "vitest";
import { INDICATORS, type IndicatorDefinition, type ValuePoint } from "@/lib/indicators";
import {
  judgeLevel,
  judgeOutcome,
  judgePeriod,
  referenceThresholds,
  sigmaThresholds,
  standardDeviation,
} from "@/lib/judge";
import { periodEnd, previousPeriods } from "@/lib/period";

const byId = (id: string) => INDICATORS.find((i) => i.id === id)!;

// [1, 2, 3, 4, 5]를 60개로 늘린 값의 표본 표준편차
const SD = Math.sqrt(120 / 59);

// key 앞 60개월은 history 값을 돌아가며 쓰고, key에는 current를 넣는다
function monthlySeries(key: string, history: number[], current: number): ValuePoint[] {
  return [
    ...previousPeriods(key, 60).map((k, i) => ({ date: periodEnd(k), value: history[i % history.length] })),
    { date: periodEnd(key), value: current },
  ];
}

describe("표준편차와 임계점", () => {
  it("표본 표준편차 (엑셀 STDEV.S)", () => {
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 5);
  });

  it("높을수록 위험하면 평균 + kσ, 낮을수록 위험하면 평균 − kσ", () => {
    const history = [8, 12]; // 평균 10, 표준편차 2.828…
    expect(sigmaThresholds(history, "above", { warning: 1.96 })!.warning).toBeCloseTo(15.5437, 4);
    expect(sigmaThresholds(history, "below", { warning: 1.96 })!.warning).toBeCloseTo(4.4563, 4);
  });

  it("기준값 × 비율", () => {
    expect(referenceThresholds(500, { caution: 1, warning: 0.9, crisis: 0.8 })).toEqual({
      caution: 500,
      warning: 450,
      crisis: 400,
    });
  });
});

describe("단계 판정", () => {
  const thresholds = { caution: 95, warning: 85, crisis: 75 };

  it("임계점과 같으면 그 단계, 여러 단계에 걸리면 가장 높은 단계", () => {
    expect(judgeLevel(95, "below", thresholds)).toBe("caution");
    expect(judgeLevel(80, "below", thresholds)).toBe("warning");
    expect(judgeLevel(70, "below", thresholds)).toBe("crisis");
    expect(judgeLevel(96, "below", thresholds)).toBe("normal");
  });

  it("분류에 없는 단계는 건너뛴다", () => {
    expect(judgeLevel(3, "above", { warning: 2 })).toBe("warning");
    expect(judgeLevel(3, "above", { caution: 2 })).toBe("caution");
  });
});

describe("지표 판정", () => {
  const history = [1, 2, 3, 4, 5]; // 60개로 늘리면 평균 3, 표준편차 약 1.4261

  it("조기경보지표는 경계만 판정한다", () => {
    const delinquency = byId("ew_bank_delinquency");
    const series = { [delinquency.id]: monthlySeries("2026-08", history, 6) };
    const result = judgePeriod(delinquency, series, "2026-08")!;
    expect(Object.keys(result.thresholds)).toEqual(["warning"]);
    expect(result.thresholds.warning).toBeCloseTo(3 + 1.96 * SD, 3);
    expect(result.status).toBe("warning");

    const calm = { [delinquency.id]: monthlySeries("2026-08", history, 4) };
    expect(judgePeriod(delinquency, calm, "2026-08")!.status).toBe("normal");
  });

  it("5년 중 빠진 달이 10% 이하면 있는 값으로 판정하고, 넘으면 판정하지 않는다", () => {
    const bsi = byId("ew_bsi");
    const full = monthlySeries("2026-08", history, 3);
    // 60개월 중 6개월 빠짐 → 54개월(90%)로 판정
    expect(judgePeriod(bsi, { [bsi.id]: full.slice(6) }, "2026-08")).not.toBeNull();
    // 7개월 빠짐 → 판정하지 않음
    expect(judgeOutcome(bsi, { [bsi.id]: full.slice(7) }, "2026-08")).toEqual({ result: null, failure: "insufficientHistory" });
  });

  it("5년 값이 모두 같으면 임계점을 정할 수 없어 판정하지 않는다", () => {
    const bsi = byId("ew_bsi");
    const flat = monthlySeries("2026-08", [90], 90);
    expect(judgeOutcome(bsi, { [bsi.id]: flat }, "2026-08")).toEqual({ result: null, failure: "noVariation" });
  });

  it("기준값이 필요한 지표에 기준값이 없으면 그 이유를 알린다", () => {
    const slb = byId("cr_recoverable_slb");
    expect(judgeOutcome(slb, { [slb.id]: [{ date: "2026-08-31", value: 500 }] }, "2026-08").failure).toBe("noReference");
  });

  it("위기대응지표: 담보가치 금액과 비교한다", () => {
    const slb = byId("cr_recoverable_slb");
    const judge = (value: number) =>
      judgePeriod(slb, { [slb.id]: [{ date: "2026-08-31", value, reference: 500 }] }, "2026-08")!.status;
    expect(judge(510)).toBe("normal");
    expect(judge(500)).toBe("caution");
    expect(judge(440)).toBe("warning");
    expect(judge(400)).toBe("crisis");
  });

  it("기준값을 입력하지 않으면 판정하지 않는다", () => {
    const slb = byId("cr_recoverable_slb");
    expect(judgePeriod(slb, { [slb.id]: [{ date: "2026-08-31", value: 500 }] }, "2026-08")).toBeNull();
  });

  it("채권회수율(무담보): 1.64σ·1.96σ·2.58σ", () => {
    const unsecured = byId("cr_recovery_unsecured");
    const judge = (z: number) =>
      judgePeriod(
        unsecured,
        { [unsecured.id]: monthlySeries("2026-08", history, 3 - z * SD) },
        "2026-08",
      )!.status;
    expect(judge(1.5)).toBe("normal");
    expect(judge(1.7)).toBe("caution");
    expect(judge(2)).toBe("warning");
    expect(judge(2.6)).toBe("crisis");
  });
});

describe("가중합 지표", () => {
  // 구성값이 둘뿐인 단순한 예: 둘 다 같은 과거 값, 가중치 0.5씩
  const composite: IndicatorDefinition = {
    ...byId("macro_financial"),
    components: [
      { id: "a", name: "A", weight: 0.5, source: { name: "테스트" } },
      { id: "b", name: "B", weight: 0.5, source: { name: "테스트" } },
    ],
  };
  const history = [1, 2, 3, 4, 5];

  it("구성값을 표준화해 가중합한다 (원래 크기가 달라도 같은 영향)", () => {
    const series = {
      a: monthlySeries("2026-08", history, 3 + 2.5 * SD), // z = 2.5
      b: monthlySeries("2026-08", history.map((v) => v * 1000), 3000), // 크기는 1000배, z = 0
    };
    const result = judgePeriod(composite, series, "2026-08")!;
    expect(result.value).toBeCloseTo(1.25, 4);
    // 과거 가중합 점수의 표준편차: 두 구성값이 같이 움직여 1
    expect(result.thresholds.caution).toBeCloseTo(1, 4);
    expect(result.status).toBe("caution");
  });

  it("구성값 하나라도 없으면 판정하지 않는다", () => {
    const series = { a: monthlySeries("2026-08", history, 3) };
    expect(judgePeriod(composite, series, "2026-08")).toBeNull();
  });

  it("지표 방향과 반대인 구성값(sign -1)은 오를수록 점수를 낮춘다", () => {
    const reversed: IndicatorDefinition = {
      ...composite,
      components: [
        { id: "a", name: "A", weight: 0.5, source: { name: "테스트" }, sign: -1 },
        { id: "b", name: "B", weight: 0.5, source: { name: "테스트" } },
      ],
    };
    // b는 a와 다르게 움직여야 과거 점수에 변동이 생긴다 (같은 값·같은 평균 3·같은 표준편차)
    const series = { a: monthlySeries("2026-08", history, 3 + 2.5 * SD), b: monthlySeries("2026-08", [2, 4, 1, 5, 3], 3) };
    expect(judgePeriod(reversed, series, "2026-08")!.value).toBeCloseTo(-1.25, 4);
  });

  it("일별 구성값은 기준월 평균으로 쓴다", () => {
    const daily = (current: [number, number]) => [
      ...monthlySeries("2026-08", history, current[0]),
      { date: "2026-08-10", value: current[1] },
    ];
    const result = judgePeriod(composite, { a: daily([3, 5]), b: daily([3, 5]) }, "2026-08")!;
    // 8월 평균 4 → z ≈ 0.701
    expect(result.value).toBeCloseTo(1 / SD, 4);
  });
});
