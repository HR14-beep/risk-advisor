import { describe, expect, it } from "vitest";
import { INDICATORS } from "@/lib/indicators";
import { addBusinessDays, todayInKorea } from "@/lib/dates";
import {
  aggregateByPeriod,
  periodEnd,
  periodLabel,
  periodOf,
  previousPeriods,
  publishDeadline,
  referencePeriod,
} from "@/lib/period";

const byId = (id: string) => INDICATORS.find((i) => i.id === id)!;

describe("기준 기간", () => {
  it("9월에 점검하면 8월분을 본다", () => {
    expect(referencePeriod("monthly", "2026-09-15")).toBe("2026-08");
    expect(referencePeriod("daily", "2026-09-15")).toBe("2026-08");
    expect(referencePeriod("monthly", "2027-01-05")).toBe("2026-12");
  });

  it("분기 지표는 전월까지 끝난 마지막 분기를 본다", () => {
    expect(referencePeriod("quarterly", "2026-09-15")).toBe("2026-Q2");
    expect(referencePeriod("quarterly", "2026-10-29")).toBe("2026-Q3");
    expect(referencePeriod("quarterly", "2027-02-10")).toBe("2026-Q4");
    expect(referencePeriod("quarterly", "2027-03-10")).toBe("2026-Q4");
  });

  it("앞 기간 목록은 해를 넘어 이어진다", () => {
    expect(previousPeriods("2026-02", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
    expect(previousPeriods("2026-Q1", 2)).toEqual(["2025-Q3", "2025-Q4"]);
  });

  it("기간의 마지막 날과 이름", () => {
    expect(periodEnd("2026-02")).toBe("2026-02-28");
    expect(periodEnd("2026-Q3")).toBe("2026-09-30");
    expect(periodLabel("2026-08")).toBe("2026년 8월");
    expect(periodLabel("2026-Q2")).toBe("2026년 2분기");
    expect(periodOf("2026-05-12", "quarterly")).toBe("2026-Q2");
  });
});

describe("발표 기한", () => {
  it("월 지표: 기간이 끝난 달로부터 발표 시점만큼 뒤의 말일", () => {
    expect(publishDeadline(byId("ew_bank_delinquency"), "2026-08")).toBe("2026-10-31"); // 2개월 후
    expect(publishDeadline(byId("ew_bsi"), "2026-08")).toBe("2026-08-31"); // 당월말
  });

  it("분기 지표: 분기말로부터 계산한다", () => {
    expect(publishDeadline(byId("ew_household_npl"), "2026-Q2")).toBe("2026-09-30"); // 3개월 이내
    expect(publishDeadline(byId("ew_vacancy_rate"), "2026-Q2")).toBe("2026-07-31"); // 1개월 이내
  });

  it("일별 지표: 기간이 끝난 다음 영업일 (휴일은 건너뛴다)", () => {
    // 2026-09-30 다음 영업일: 10-01(목)
    expect(publishDeadline(byId("macro_financial"), "2026-09")).toBe("2026-10-01");
    // 추석 연휴(9/24~25), 주말, 대체공휴일(9/28)을 건너뛴다
    expect(addBusinessDays("2026-09-23", 1, "KR")).toBe("2026-09-29");
  });

  it("직접 입력 지표: 기준월이 끝나고 28일 뒤", () => {
    expect(publishDeadline(byId("cr_receivables"), "2026-08")).toBe("2026-09-28");
  });
});

describe("기간별로 묶기", () => {
  it("한 기간에 값이 여러 개면 평균을 쓴다 (일별 → 기준월 평균)", () => {
    const periods = aggregateByPeriod(
      [
        { date: "2026-08-03", value: 10 },
        { date: "2026-08-04", value: 20 },
        { date: "2026-09-01", value: 30, reference: 100 },
      ],
      "daily",
    );
    expect(periods.get("2026-08")).toEqual({ value: 15, reference: undefined });
    expect(periods.get("2026-09")).toEqual({ value: 30, reference: 100 });
  });
});

describe("한국 시간", () => {
  it("UTC 15시 이후는 한국에서 다음 날이다", () => {
    expect(todayInKorea(new Date("2026-10-28T15:30:00Z"))).toBe("2026-10-29");
    expect(todayInKorea(new Date("2026-10-28T14:30:00Z"))).toBe("2026-10-28");
  });
});
