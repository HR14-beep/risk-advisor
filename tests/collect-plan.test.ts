import { describe, expect, it } from "vitest";
import { collectStart, mergeSeries } from "@/lib/collect-plan";

const FULL_START = "2020-09-01";

describe("수집 범위 정하기", () => {
  it("저장된 값이 없으면 처음부터 다 가져온다", () => {
    expect(collectStart([], FULL_START)).toBe(FULL_START);
  });

  it("저장된 값이 처음부터 있으면 마지막 저장일 62일 전부터만 가져온다", () => {
    const stored = [
      { date: "2020-09-30", value: 1 },
      { date: "2026-09-30", value: 2 },
    ];
    expect(collectStart(stored, FULL_START)).toBe("2026-07-30");
  });

  it("저장된 값이 중간부터만 있으면 처음부터 다시 가져온다", () => {
    const stored = [
      { date: "2025-01-31", value: 1 },
      { date: "2026-09-30", value: 2 },
    ];
    expect(collectStart(stored, FULL_START)).toBe(FULL_START);
  });

  it("다시 받을 시작일이 처음보다 앞서면 처음부터", () => {
    const stored = [
      { date: "2020-09-30", value: 1 },
      { date: "2020-10-31", value: 2 },
    ];
    expect(collectStart(stored, FULL_START)).toBe(FULL_START);
  });
});

describe("값 합치기", () => {
  it("같은 기준일은 새로 수집한 값으로 바꾸고, 기준일 순서로 둔다", () => {
    const merged = mergeSeries(
      [
        { date: "2026-07-31", value: 70 },
        { date: "2026-08-31", value: 71 },
      ],
      [
        { date: "2026-09-30", value: 73 },
        { date: "2026-08-31", value: 72 },
      ],
    );
    expect(merged).toEqual([
      { date: "2026-07-31", value: 70 },
      { date: "2026-08-31", value: 72 },
      { date: "2026-09-30", value: 73 },
    ]);
  });
});
