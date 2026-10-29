import { describe, expect, it } from "vitest";
import { INDICATORS } from "@/lib/indicators";
import { sampleSeries } from "@/lib/sample-values";
import { buildComparison } from "@/lib/compare";
import { judgePeriod } from "@/lib/judge";

const TODAY = "2026-10-29";
const series = sampleSeries(TODAY);
const find = (pred: (i: (typeof INDICATORS)[number]) => boolean) => INDICATORS.find(pred)!;

describe("최근 3년 지표 비교", () => {
  const monthly = find((i) => i.publicationCycle === "monthly" && !i.components);
  const quarterly = find((i) => i.publicationCycle === "quarterly");

  it("월 지표는 기준월(전월)까지 36개월, 분기 지표는 12분기를 그린다", () => {
    const m = buildComparison(monthly, series, TODAY);
    expect(m.points).toHaveLength(36);
    expect(m.points.at(-1)!.period).toBe("2026-09");
    expect(m.points[0].period).toBe("2023-10");
    expect(m.years).toEqual([2024, 2025, 2026]);

    const q = buildComparison(quarterly, series, TODAY);
    expect(q.points).toHaveLength(12);
    expect(q.points.at(-1)!.period).toBe("2026-Q3");
    expect(q.rows.map((r) => r.label)).toEqual(["1분기", "2분기", "3분기", "4분기"]);
  });

  it("값과 단계는 지표 현황 판정과 같다", () => {
    const { points } = buildComparison(monthly, series, TODAY);
    const last = points.findLast((p) => p.status !== null)!;
    const judged = judgePeriod(monthly, series, last.period)!;
    expect(last.value).toBe(judged.value);
    expect(last.status).toBe(judged.status);
  });

  it("표는 같은 달을 연도별로 놓고, 아직 오지 않은 달은 비운다", () => {
    const { rows } = buildComparison(monthly, series, TODAY);
    expect(rows).toHaveLength(12);
    const sep = rows[8]; // 9월
    expect(sep.points.map((p) => p?.period)).toEqual(["2024-09", "2025-09", "2026-09"]);
    const aug = rows[7]; // 8월: 두 해 모두 값이 있으면 전년 대비를 계산한다
    if (aug.points[1]?.value != null && aug.points[2]?.value != null) expect(aug.change).not.toBeNull();
    const nov = rows[10]; // 11월: 2026년은 아직
    expect(nov.points[2]).toBeNull();
    expect(nov.change).toBeNull();
    // 첫해 1~9월은 그래프 범위 밖이어도 표에는 채운다
    expect(rows[0].points[0]?.period).toBe("2024-01");
  });

  it("가중합 지표도 판정한 점수로 비교한다", () => {
    const composite = find((i) => Boolean(i.components));
    const { points } = buildComparison(composite, series, TODAY);
    const last = points.at(-1)!;
    expect(last.value).toBe(judgePeriod(composite, series, last.period)?.value ?? null);
  });

  it("값이 없으면 모두 빈칸이다", () => {
    const { points, rows } = buildComparison(monthly, {}, TODAY);
    expect(points.every((p) => p.value === null && p.status === null)).toBe(true);
    expect(rows.every((r) => r.change === null)).toBe(true);
  });
});
