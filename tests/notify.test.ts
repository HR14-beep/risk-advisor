import { describe, expect, it } from "vitest";
import { INDICATORS } from "@/lib/indicators";
import { buildDashboard } from "@/lib/dashboard";
import { sampleSeries } from "@/lib/sample-values";
import { buildDigest, renderDigestEmail, type DigestRow } from "@/lib/notify-digest";

const TODAY = "2026-10-29";
const { sections } = buildDashboard(INDICATORS, sampleSeries(TODAY), TODAY);
const allRows = sections.flatMap((s) => s.rows);

// 가상 값 화면 데이터를 "실제 값"이라고 보고 알림 대상으로 쓴다 (sample 표시를 끈다)
const asReal = (rows = allRows): DigestRow[] => rows.map((row) => ({ ...row, isSample: false }));

describe("새로 발표된 값 골라내기", () => {
  it("첫 알림이면 값이 있는 공개 통계 지표를 모두 담는다 (직접 입력 지표는 뺀다)", () => {
    const { items, snapshot } = buildDigest(asReal(), null);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => !i.id.startsWith("cr_"))).toBe(true);
    expect(Object.keys(snapshot)).toEqual(expect.arrayContaining(["ew_bsi", "ew_household_npl"]));
  });

  it("지난 알림과 같으면 아무것도 담지 않는다", () => {
    const { snapshot } = buildDigest(asReal(), null);
    expect(buildDigest(asReal(), snapshot).items).toEqual([]);
  });

  it("최근 기간이 바뀐 지표만 새 값으로 담는다", () => {
    const { snapshot } = buildDigest(asReal(), null);
    const older = { ...snapshot, ew_bsi: { ...snapshot.ew_bsi, period: "2026-08" } };
    expect(buildDigest(asReal(), older).items.map((i) => i.id)).toEqual(["ew_bsi"]);
  });

  it("단계가 바뀐 지표는 표시하고 맨 위에 둔다", () => {
    const { snapshot } = buildDigest(asReal(), null);
    const changed = {
      ...snapshot,
      ew_bsi: { ...snapshot.ew_bsi, period: "2026-08" },
      ew_vacancy_rate: { ...snapshot.ew_vacancy_rate, status: "normal" as const },
    };
    const { items } = buildDigest(asReal(), changed);
    expect(items[0]).toMatchObject({ id: "ew_vacancy_rate", previousStatus: "normal", status: "warning" });
  });

  it("가상 값·수집 실패 지표는 담지 않는다", () => {
    const rows = allRows.map((row) => ({ ...row, isSample: row.indicator.id !== "ew_bsi" }));
    expect(buildDigest(rows, null).items.map((i) => i.id)).toEqual(["ew_bsi"]);
    const failed = asReal().map((row) => (row.indicator.id === "ew_bsi" ? { ...row, status: "collectionFailed" as const } : row));
    expect(buildDigest(failed, null).items.map((i) => i.id)).not.toContain("ew_bsi");
  });
});

describe("메일 내용", () => {
  it("제목에 날짜·건수·단계 변경 건수를 넣고, 본문에 지표·값·단계·링크를 넣는다", () => {
    const { snapshot } = buildDigest(asReal(), null);
    const { items } = buildDigest(asReal(), { ...snapshot, ew_vacancy_rate: { ...snapshot.ew_vacancy_rate, status: "normal" } });
    const mail = renderDigestEmail(items, "10월 30일(금)", "https://example.vercel.app");
    expect(mail.subject).toBe("[위기관리 신호등] 10월 30일(금) 지표 업데이트 1건 (단계 변경 1건)");
    expect(mail.text).toContain("공실률 (2026년 3분기)");
    expect(mail.text).toContain("정상 → 경계");
    expect(mail.html).toContain('href="https://example.vercel.app"');
  });

  it("지표 이름에 든 특수 문자는 HTML로 해석되지 않게 바꾼다", () => {
    const mail = renderDigestEmail(
      [{ id: "x", name: "A<b>&", period: "2026-09", value: "1", status: "normal", change: null, previousStatus: null, source: "S" }],
      "10월 30일(금)",
      "https://example.vercel.app",
    );
    expect(mail.html).toContain("A&lt;b&gt;&amp;");
  });
});
