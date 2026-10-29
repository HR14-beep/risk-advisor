import { describe, expect, it } from "vitest";
import { CollectorError } from "@/lib/collectors/common";
import { sumNplRatios } from "@/lib/collectors/fisis";
import { parseKosis } from "@/lib/collectors/kosis";
import { parseRone } from "@/lib/collectors/rone";

describe("금감원 FISIS 고정이하여신비율", () => {
  it("은행별 값을 계정·분기별로 더해 비율(%)로 바꾼다", () => {
    const ratios = sumNplRatios([
      { base_month: "202506", account_cd: "B", a: "100000", b: "300" },
      { base_month: "202506", account_cd: "B", a: "300000", b: "500" },
      { base_month: "202503", account_cd: "B", a: "400000", b: "400" },
      { base_month: "202506", account_cd: "A1", a: "200000", b: "1000" },
    ]);
    expect(ratios.B).toEqual([
      { date: "2025-03-31", value: 0.1 },
      { date: "2025-06-30", value: 0.2 },
    ]);
    expect(ratios.A1).toEqual([{ date: "2025-06-30", value: 0.5 }]);
  });
});

describe("부동산원 R-ONE 응답 읽기", () => {
  const body = (rows: { WRTTIME_IDTFR_ID: string; DTA_VAL: number | null }[], code = "INFO-000") => ({
    SttsApiTblData: [
      { head: [{ list_total_count: rows.length }, { RESULT: { CODE: code, MESSAGE: "" } }] },
      { row: rows },
    ] as never,
  });

  it("월·분기 기간을 기간 말일로 바꾼다", () => {
    expect(parseRone(body([{ WRTTIME_IDTFR_ID: "202608", DTA_VAL: 100.6 }]), "MM").points).toEqual([
      { date: "2026-08-31", value: 100.6 },
    ]);
    expect(parseRone(body([{ WRTTIME_IDTFR_ID: "202402", DTA_VAL: 99.9 }]), "QY").points).toEqual([
      { date: "2024-06-30", value: 99.9 },
    ]);
  });

  it("오류 응답은 수집 실패로 알린다", () => {
    expect(() => parseRone({ RESULT: { CODE: "ERROR-290", MESSAGE: "인증키가 유효하지 않습니다." } }, "MM")).toThrow(
      CollectorError,
    );
  });
});

describe("KOSIS 응답 읽기", () => {
  it("월 값을 그 달 말일로, 오래된 순서로 바꾼다", () => {
    expect(
      parseKosis([
        { PRD_DE: "202608", DT: "105.2" },
        { PRD_DE: "202607", DT: "104.9" },
      ]),
    ).toEqual([
      { date: "2026-07-31", value: 104.9 },
      { date: "2026-08-31", value: 105.2 },
    ]);
  });

  it("데이터 없음은 빈 목록, 그 밖의 오류는 수집 실패", () => {
    expect(parseKosis({ err: "30", errMsg: "데이터가 존재하지 않습니다." })).toEqual([]);
    expect(() => parseKosis({ err: "21", errMsg: "잘못된 요청 변수" })).toThrow(CollectorError);
  });
});
