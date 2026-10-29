import { describe, expect, it } from "vitest";
import { INDICATORS } from "@/lib/indicators";
import { buildDashboard } from "@/lib/dashboard";
import { sampleSeries } from "@/lib/sample-values";
import { REPORT_INSTRUCTIONS, buildSectionInput, checkDraft } from "@/lib/report-prompt";

const TODAY = "2026-10-29";
const { sections } = buildDashboard(INDICATORS, sampleSeries(TODAY), TODAY, new Set(["ew_bsi"]));
const inputOf = (index: number, sample = false) =>
  buildSectionInput(
    sections[index].category,
    sections[index].rows.map((row) => ({ ...row, isSample: sample })),
    "2026-10",
  );

describe("AI에게 넘길 내용", () => {
  it("판정이 끝난 값·임계점·단계·직전 대비를 지표 순서대로 넘긴다", () => {
    const input = inputOf(2);
    expect(input).toContain("보고 월: 2026년 10월");
    expect(input).toContain("분류: 위기대응지표 (8개 지표)");
    const lines = input.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(8);
    // 임계점을 넘은 지표가 위험한 순서로 맨 앞
    expect(lines[0]).toContain("지표: 채권회수율(무담보) | 판정: 위기");
    expect(lines[0]).toMatch(/임계점: 위기 .+ 이하, 경계 .+ 이하, 주의 .+ 이하/);
    expect(lines[0]).toMatch(/직전 대비: -[\d.]+%p \(2026년 8월 대비\)/);
  });

  it("발표 전·수집 실패·가상 값을 구분해 적는다", () => {
    const input = inputOf(1, true);
    expect(input).toMatch(/지표: 가계 고정이하여신비율 \| 판정: 발표 전 .*직전 값: .+ \(2026년 2분기\).*발표 예정: 12월 31일까지/);
    expect(input).toMatch(/지표: BSI \| 판정: .*수집 실패, 직전 값 기준일 2026-09-30/);
    expect(input).toContain("실습용 가상 값");
  });

  it("가중합 지표는 구성과 가중치를 함께 넘긴다", () => {
    expect(inputOf(0)).toContain("구성: KOSPI 20% + VKOSPI 20% + 신용스프레드 25% + 한국 CDS 프리미엄 25% + 원/달러 환율 10%");
  });

  it("규칙에 PRD must 2의 핵심 항목이 들어 있다", () => {
    for (const phrase of ["입력에 적힌 수치만", "[위기] / [경계] / [주의]", "발표 전", "데이터 없음", "수집 실패, 직전 값 기준일", "담당자가 정한다", "권유하는 표현은 쓰지 않는다", "A4 1쪽"]) {
      expect(REPORT_INSTRUCTIONS).toContain(phrase);
    }
  });
});

describe("AI 초안 점검", () => {
  const input = "- 지표: 환율 | 값: 1,412.5 원 | 직전 대비: +3.1% (2026년 9월 대비)";

  it("입력에 있는 숫자와 작은 번호는 통과한다", () => {
    expect(checkDraft("1. 변동 요약\n환율은 1,412.5원으로 직전 대비 +3.1% 올랐음 (2026년 9월 대비)", input)).toEqual([]);
  });

  it("입력에 없는 숫자를 찾는다", () => {
    expect(checkDraft("환율은 1,450원까지 오를 수 있음", input)).toEqual(["입력에 없는 숫자가 있어요: 1450"]);
  });

  it("투자·거래 권유로 보이는 표현을 찾는다", () => {
    expect(checkDraft("달러 매수를 검토함", input)).toEqual(["투자·거래 권유로 보일 수 있는 표현이 있어요: 매수"]);
  });
});
