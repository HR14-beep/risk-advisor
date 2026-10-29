import { describe, expect, it } from "vitest";
import { INDICATORS } from "@/lib/indicators";
import { describeStats, indicatorInsights, seriesStats } from "@/lib/insights";
import { periodEnd, previousPeriods } from "@/lib/period";
import { REPORT_INSTRUCTIONS } from "@/lib/report-prompt";

const byId = (id: string) => INDICATORS.find((i) => i.id === id)!;

// 2026-09 앞 60개월은 80~99를 돌고, 마지막 3개월은 연속 하락, 2026-09는 70
function series() {
  const keys = previousPeriods("2026-09", 60);
  const points = keys.map((k, i) => ({ date: periodEnd(k), value: 80 + (i % 20) }));
  points[57].value = 95;
  points[58].value = 90;
  points[59].value = 85;
  return [...points, { date: periodEnd("2026-09"), value: 70 }];
}

describe("외부 통계 요약", () => {
  it("5년 평균·범위·위치, 전년 같은 달 대비, 최근 추세를 계산한다", () => {
    const stats = seriesStats(series(), "monthly", "2026-09", "")!;
    expect(stats.range).toMatchObject({ periods: 60, first: "2021-09", min: 80 });
    expect(stats.value).toBe(70);
    expect(stats.trend).toBe("down");
    expect(stats.yearAgo?.period).toBe("2025-09");
  });

  it("한 줄 문장으로 적는다 (5년 최저면 '기간 중 최저')", () => {
    const text = describeStats("BSI", seriesStats(series(), "monthly", "2026-09", "")!, "", "monthly");
    expect(text).toMatch(/^BSI 2026년 9월 70 · 5년\(2021년 9월~\) 평균 [\d.]+, 범위 80~99, 기간 중 최저 · 전년 같은 달 대비 -[\d.]+% · 최근 3개월 연속 하락$/);
  });

  it("값이 없으면 요약하지 않고, 짧은 기록은 범위를 빼고 적는다", () => {
    expect(seriesStats([], "monthly", "2026-09", "")).toBeNull();
    const short = seriesStats(series().slice(-5), "monthly", "2026-09", "")!;
    expect(short.range).toBeNull();
  });

  it("출처 기관을 함께 적는다", () => {
    expect(indicatorInsights(byId("ew_bsi"), { ew_bsi: series() }, "2026-09")[0]).toMatch(/\(출처: 한국은행 ECOS\)$/);
  });

  it("보고서 규칙에 시사점 소제목과 근거·예측 금지 규칙이 있다", () => {
    expect(REPORT_INSTRUCTIONS).toContain('"3. 외부 통계로 본 시사점"');
    expect(REPORT_INSTRUCTIONS).toContain("앞으로의 수치를 예측하거나 원인을 단정하지 않는다");
  });
});
