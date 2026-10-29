import { describe, expect, it } from "vitest";
import { parseHistoryText, parseManualValues, toNumber } from "@/lib/schemas";

const TODAY = "2026-09-15"; // 기준월 2026-08

function errorsOf(entries: unknown[]) {
  const result = parseManualValues({ entries }, TODAY);
  return result.ok ? [] : result.errors;
}

describe("직접 입력값 검사", () => {
  it("올바른 값은 통과한다", () => {
    const result = parseManualValues(
      {
        entries: [
          { indicatorId: "cr_recoverable_slb", period: "2026-08", value: 525, reference: 500 },
          { indicatorId: "cr_recovery_unsecured", period: "2026-08", value: 32.7 },
        ],
      },
      TODAY,
    );
    expect(result.ok).toBe(true);
  });

  it("숫자가 아니면 막는다", () => {
    expect(errorsOf([{ indicatorId: "cr_recovery_unsecured", period: "2026-08", value: Number.NaN }])).toEqual([
      expect.objectContaining({ index: 0, field: "value", message: "숫자를 입력해 주세요" }),
    ]);
  });

  it("기준값이 필요한 지표에 기준값이 없거나 0 이하면 막는다", () => {
    expect(errorsOf([{ indicatorId: "cr_receivables", period: "2026-08", value: 35 }])[0]).toMatchObject({
      field: "reference",
      message: "목표값을(를) 입력해 주세요",
    });
    expect(errorsOf([{ indicatorId: "cr_receivables", period: "2026-08", value: 35, reference: 0 }])[0]).toMatchObject({
      field: "reference",
    });
    expect(errorsOf([{ indicatorId: "cr_receivables", period: "2026-08", value: 35, reference: -5 }])[0]).toMatchObject({
      field: "reference",
    });
  });

  it("기준값을 쓰지 않는 지표에 기준값이 있으면 막는다", () => {
    expect(
      errorsOf([{ indicatorId: "cr_recovery_unsecured", period: "2026-08", value: 30, reference: 10 }])[0],
    ).toMatchObject({ field: "reference" });
  });

  it("자동 수집 지표나 없는 지표는 막는다", () => {
    expect(errorsOf([{ indicatorId: "ew_bsi", period: "2026-08", value: 90 }])[0]).toMatchObject({
      field: "indicatorId",
    });
  });

  it("아직 끝나지 않은 달, 잘못된 기간 형식, 같은 달 중복을 막는다", () => {
    expect(errorsOf([{ indicatorId: "cr_recovery_unsecured", period: "2026-09", value: 30 }])[0]).toMatchObject({
      field: "period",
    });
    expect(errorsOf([{ indicatorId: "cr_recovery_unsecured", period: "2026-13", value: 30 }])[0]).toMatchObject({
      field: "period",
    });
    const duplicated = errorsOf([
      { indicatorId: "cr_recovery_unsecured", period: "2026-07", value: 30 },
      { indicatorId: "cr_recovery_unsecured", period: "2026-07", value: 31 },
    ]);
    expect(duplicated).toEqual([expect.objectContaining({ index: 1, field: "period" })]);
  });

  it("빈 목록은 막는다", () => {
    expect(errorsOf([])[0]).toMatchObject({ index: -1, field: "entries" });
  });
});

describe("입력 칸 글자 바꾸기", () => {
  it("쉼표를 빼고 숫자로 바꾼다", () => {
    expect(toNumber("1,234.5")).toBe(1234.5);
    expect(toNumber("  ")).toBeUndefined();
    expect(toNumber("abc")).toBeNaN();
  });

  it("엑셀에서 복사한 과거 값을 읽는다", () => {
    const { rows, errors } = parseHistoryText("2021-09\t41.2\n2021.10 40\n\n202111,39.5\n잘못된 줄");
    expect(rows).toEqual([
      { period: "2021-09", value: 41.2 },
      { period: "2021-10", value: 40 },
      { period: "2021-11", value: 39.5 },
    ]);
    expect(errors).toHaveLength(1);
  });
});
