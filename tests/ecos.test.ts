import { describe, expect, it } from "vitest";
import { CollectorError, parseEcos, subtractByDate } from "@/lib/collectors/ecos";

describe("한국은행 ECOS 응답 읽기", () => {
  it("월 값을 그 달 말일 기준으로, 오래된 순서로 바꾼다", () => {
    const points = parseEcos({
      StatisticSearch: {
        row: [
          { TIME: "202602", DATA_VALUE: "71" },
          { TIME: "202601", DATA_VALUE: "72" },
          { TIME: "202603", DATA_VALUE: "" }, // 빈 값은 건너뛴다
        ],
      },
    }, "M");
    expect(points).toEqual([
      { date: "2026-01-31", value: 72 },
      { date: "2026-02-28", value: 71 },
    ]);
  });

  it("데이터가 없다는 응답은 빈 목록", () => {
    expect(parseEcos({ RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." } }, "M")).toEqual([]);
  });

  it("그 밖의 오류는 수집 실패로 알린다", () => {
    expect(() =>
      parseEcos({ RESULT: { CODE: "INFO-100", MESSAGE: "인증키가 유효하지 않습니다.\n자세한 설명" } }, "M"),
    ).toThrow(CollectorError);
  });

  it("일별 값은 그날 날짜로 바꾼다", () => {
    const points = parseEcos({ StatisticSearch: { row: [{ TIME: "20261002", DATA_VALUE: "7003.74" }] } }, "D");
    expect(points).toEqual([{ date: "2026-10-02", value: 7003.74 }]);
  });
});

describe("신용스프레드 계산", () => {
  it("같은 날끼리 회사채 금리 − 국고채 금리, 한쪽에만 있는 날은 뺀다", () => {
    const corp = [
      { date: "2026-10-01", value: 4.701 },
      { date: "2026-10-02", value: 4.638 },
    ];
    const gov = [
      { date: "2026-10-01", value: 4.01 },
      { date: "2026-10-05", value: 3.9 },
    ];
    expect(subtractByDate(corp, gov)).toEqual([{ date: "2026-10-01", value: 0.691 }]);
  });
});
