import { describe, expect, it } from "vitest";
import { INDICATORS } from "@/lib/indicators";
import { periodChange } from "@/lib/change";
import { buildDashboard, buildRow } from "@/lib/dashboard";
import { sampleSeries } from "@/lib/sample-values";

const byId = (id: string) => INDICATORS.find((i) => i.id === id)!;

describe("직전 기간 대비 변동", () => {
  it("단위가 %면 차이(%p)", () => {
    expect(periodChange(3.5, { period: "2026-07", value: 3.25 }, "%")).toMatchObject({ change: 0.25, unit: "%p" });
  });

  it("가중합 점수는 차이(점)", () => {
    expect(periodChange(1.2, { period: "2026-07", value: 0.7 }, "점")).toMatchObject({ change: 0.5, unit: "점" });
  });

  it("그 밖의 단위는 변동률(%)", () => {
    expect(periodChange(1442, { period: "2026-07", value: 1400 }, "")).toMatchObject({ change: 3, unit: "%" });
    expect(periodChange(5, { period: "2026-07", value: 0 }, "")).toBeNull();
  });
});

describe("발표 전과 데이터 없음", () => {
  const delinquency = byId("ew_bank_delinquency"); // 월, 2개월 후 발표
  const bsi = byId("ew_bsi"); // 월, 당월말 발표
  const receivables = byId("cr_receivables"); // 직접 입력
  const july = [{ date: "2026-07-31", value: 0.4, reference: 50 }];

  it("발표 시점 전이면 발표 전, 직전 발표 기간을 함께 알려 준다", () => {
    const row = buildRow(delinquency, { [delinquency.id]: july }, "2026-09-15");
    expect(row).toMatchObject({ period: "2026-08", status: "notYetPublished", deadline: "2026-10-31" });
    expect(row.previous?.period).toBe("2026-07");
  });

  it("자동 수집 지표가 발표 시점을 넘기면 데이터 없음", () => {
    const row = buildRow(bsi, { [bsi.id]: july }, "2026-09-15");
    expect(row).toMatchObject({ status: "noData", noDataReason: "missing" });
  });

  it("직접 입력 지표는 기준월이 끝나고 28일이 지나면 갱신 필요", () => {
    expect(buildRow(receivables, { [receivables.id]: july }, "2026-09-28")).toMatchObject({
      status: "notYetPublished",
      needsUpdate: false,
    });
    expect(buildRow(receivables, { [receivables.id]: july }, "2026-09-29")).toMatchObject({
      status: "notYetPublished",
      needsUpdate: true,
    });
  });

  it("값은 있는데 5년치 과거 값이 모자라면 데이터 없음", () => {
    const row = buildRow(bsi, { [bsi.id]: [{ date: "2026-08-31", value: 90 }] }, "2026-09-15");
    expect(row).toMatchObject({ status: "noData", noDataReason: "insufficientHistory" });
  });
});

describe("수집 실패", () => {
  const bsi = byId("ew_bsi");
  const today = "2026-10-29"; // 기준월 2026-09
  const samples = sampleSeries(today);
  const upToAugust = { [bsi.id]: samples[bsi.id].filter((p) => p.date <= "2026-08-31") };

  it("기준 기간 값이 저장돼 있지 않으면 수집 실패로 보고, 직전 값은 판정하지 않는다", () => {
    const row = buildRow(bsi, upToAugust, today, true);
    expect(row).toMatchObject({
      status: "collectionFailed",
      result: null,
      collectionFailure: { lastDate: "2026-08-31" },
    });
    expect(row.previous?.period).toBe("2026-08");
  });

  it("기준 기간 값이 저장돼 있어도 수집에 실패하면 판정하지 않고 저장된 값은 참고로만 보여 준다", () => {
    const row = buildRow(bsi, samples, today, true);
    expect(row).toMatchObject({ status: "collectionFailed", result: null, collectionFailure: { lastDate: "2026-09-30" } });
    expect(row.previous?.period).toBe("2026-09");
  });

  it("판정하지 못한 이유를 알려 준다 (5년 값이 모두 같음)", () => {
    const flat = Array.from({ length: 62 }, (_, i) => ({ date: `20${21 + Math.floor((i + 7) / 12)}-${String(((i + 7) % 12) + 1).padStart(2, "0")}-28`, value: 90 }));
    expect(buildRow(bsi, { [bsi.id]: flat }, today)).toMatchObject({ status: "noData", noDataReason: "noVariation" });
  });

  it("저장된 값이 하나도 없으면 직전 값 기준일은 없음", () => {
    expect(buildRow(bsi, {}, today, true)).toMatchObject({
      status: "collectionFailed",
      collectionFailure: { lastDate: null },
      previous: null,
    });
  });

  it("실패하지 않은 지표에는 표시하지 않고, 요약 개수에 수집 실패를 센다", () => {
    expect(buildRow(bsi, upToAugust, today).collectionFailure).toBeNull();
    const dashboard = buildDashboard([bsi], upToAugust, today, new Set([bsi.id]));
    expect(dashboard.counts.collectionFailed).toBe(1);
  });
});

// 가상 값은 오늘 날짜를 기준으로 만들어지므로 날짜가 달라도 같은 결과가 나와야 한다
describe.each(["2026-09-15", "2026-10-29", "2026-12-01", "2027-01-10"])("가상 값 지표 현황 (오늘 %s)", (today) => {
  const dashboard = buildDashboard(INDICATORS, sampleSeries(today), today);
  const rows = dashboard.sections.flatMap((s) => s.rows);
  const statusOf = (id: string) => rows.find((r) => r.indicator.id === id)!.status;

  it("단계별 개수", () => {
    expect(dashboard.counts).toEqual({
      crisis: 2,
      warning: 3,
      caution: 2,
      normal: 7,
      notYetPublished: 7,
      collectionFailed: 0,
      noData: 1,
    });
  });

  it("지표별 판정", () => {
    expect(statusOf("macro_financial")).toBe("caution");
    expect(statusOf("macro_economy")).toBe("normal");
    expect(statusOf("ew_household_npl")).toBe("notYetPublished");
    expect(statusOf("ew_vacancy_rate")).toBe("warning");
    expect(statusOf("ew_auction_rate")).toBe("warning");
    expect(statusOf("ew_bdi")).toBe("noData");
    expect(statusOf("cr_recovery_unsecured")).toBe("crisis");
    expect(statusOf("cr_recovery_secured")).toBe("caution");
    expect(statusOf("cr_recoverable_indirect")).toBe("warning");
    expect(statusOf("cr_receivables")).toBe("crisis");
    expect(statusOf("cr_estimated_collateral")).toBe("notYetPublished");
  });

  it("발표 전 지표는 직전 발표 값과 그 판정을 함께 보여 준다", () => {
    const household = rows.find((r) => r.indicator.id === "ew_household_npl")!;
    expect(household.previous?.result?.status).toBe("warning");
  });

  it("분류마다 쓰지 않는 단계는 나오지 않는다", () => {
    const allowed = { macro: ["caution", "normal"], "early-warning": ["warning", "normal"] } as const;
    for (const section of dashboard.sections) {
      if (section.category === "crisis-response") continue;
      for (const row of section.rows) {
        if (row.result) expect(allowed[section.category]).toContain(row.result.status);
      }
    }
  });

  it("분류 안에서는 임계점을 넘은 지표가 위험한 순서로 맨 앞에 온다", () => {
    expect(dashboard.sections.map((s) => s.category)).toEqual(["macro", "early-warning", "crisis-response"]);
    const ids = dashboard.sections[2].rows.map((r) => r.indicator.id);
    expect(ids.slice(0, 4)).toEqual([
      "cr_recovery_unsecured",
      "cr_receivables",
      "cr_recoverable_indirect",
      "cr_recovery_secured",
    ]);
  });
});
