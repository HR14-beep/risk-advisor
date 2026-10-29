import { describe, expect, it } from "vitest";
import { rowsToSeries, toValueRows, type ValueRow } from "@/lib/value-rows";

describe("저장소 표 한 줄 바꾸기", () => {
  it("값을 표의 줄로 바꾼다 (기준값이 없으면 비워 둔다)", () => {
    expect(
      toValueRows("cr_recoverable_slb", [{ date: "2026-08-31", value: 525, reference: 500 }], "manual"),
    ).toEqual([
      {
        indicator_id: "cr_recoverable_slb",
        value: 525,
        reference: 500,
        value_date: "2026-08-31",
        collection_method: "manual",
        success: true,
      },
    ]);
    expect(toValueRows("ew_bsi", [{ date: "2026-08-31", value: 90 }], "auto")[0].reference).toBeNull();
  });

  it("읽어 온 줄을 지표별·기준일 순서로 묶고, 수집 실패 기록은 뺀다", () => {
    const row = (indicator_id: string, value_date: string, value: number | null, success = true): ValueRow => ({
      indicator_id,
      value,
      reference: null,
      value_date,
      collection_method: "auto",
      success,
    });
    const series = rowsToSeries([
      row("ew_bsi", "2026-08-31", 90),
      row("ew_bsi", "2026-07-31", 88),
      row("ew_bsi", "2026-09-30", null, false),
      row("macro_financial.kospi", "2026-08-03", 2600),
    ]);
    expect(series).toEqual({
      ew_bsi: [
        { date: "2026-07-31", value: 88 },
        { date: "2026-08-31", value: 90 },
      ],
      "macro_financial.kospi": [{ date: "2026-08-03", value: 2600 }],
    });
  });

  it("기준값이 있으면 함께 담는다", () => {
    const series = rowsToSeries([
      {
        indicator_id: "cr_receivables",
        value: 35,
        reference: 50,
        value_date: "2026-08-31",
        collection_method: "manual",
        success: true,
      },
    ]);
    expect(series.cr_receivables).toEqual([{ date: "2026-08-31", value: 35, reference: 50 }]);
  });
});
