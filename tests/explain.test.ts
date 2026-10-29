import { describe, expect, it } from "vitest";
import { INDICATORS } from "@/lib/indicators";
import { buildDashboard } from "@/lib/dashboard";
import { sampleSeries } from "@/lib/sample-values";
import {
  buildExplainInput,
  componentContributions,
  EXPLAIN_JSON_SCHEMA,
  EXPLAINABLE,
  explainInstructions,
  parseExplanation,
} from "@/lib/explain-prompt";

const TODAY = "2026-10-29";
const series = sampleSeries(TODAY);
const rows = buildDashboard(INDICATORS, series, TODAY)
  .sections.flatMap((s) => s.rows)
  .map((r) => ({ ...r, isSample: true }));
const risky = rows.filter((r) => EXPLAINABLE.includes(r.status));

describe("원인 분석 입력", () => {
  it("가상 값에도 위험 단계 지표가 있어야 시험할 수 있다", () => {
    expect(risky.length).toBeGreaterThan(0);
  });

  it("지표 판정·위험 방향·최근 값·다른 위험 지표를 넣고, 자기 자신은 다른 지표 목록에서 뺀다", () => {
    const row = risky.find((r) => !r.indicator.components)!;
    const input = buildExplainInput(row, rows, series);
    expect(input).toContain(`지표: ${row.indicator.name}`);
    expect(input).toMatch(/위험 방향: (오를수록|내릴수록) 위험/);
    expect(input).toContain("최근 값:");
    expect(input).toContain("실습용 가상 값");
    const others = input.split("[같은 시점에 위험 단계인 다른 지표]")[1];
    expect(others).not.toContain(`- ${row.indicator.name}:`);
  });

  it("가중합 지표는 구성값마다 점수 기여를 적는다", () => {
    const composite = rows.find((r) => r.indicator.components && r.result)!;
    const lines = componentContributions(composite, series);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatch(/표준점수 .* → 점수 기여 [+-]/);
  });
});

describe("원인 분석 규칙과 답 검사", () => {
  it("웹 검색 여부에 따라 규칙이 다르다", () => {
    expect(explainInstructions(true)).toContain("웹 검색으로");
    expect(explainInstructions(false)).toContain("웹 검색은 쓰지 않는다");
    expect(explainInstructions(true)).toContain("판정(단계)은 입력에 적힌 그대로다");
  });

  it("JSON 모양은 strict 요건(모든 칸 필수, 추가 칸 금지)을 지킨다", () => {
    expect(EXPLAIN_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(EXPLAIN_JSON_SCHEMA.required).toEqual(["summary", "factors", "check"]);
  });

  const answer = JSON.stringify({
    summary: "요약",
    factors: [
      { text: "데이터 근거", basis: "data" },
      { text: "기사 근거", basis: "news" },
    ],
    check: "확인할 점",
  });

  it("맞는 답은 그대로 읽는다", () => {
    expect(parseExplanation(answer, true)?.factors.map((f) => f.basis)).toEqual(["data", "news"]);
  });

  it("웹 검색을 안 썼는데 기사라고 하면 데이터로 바꾼다", () => {
    expect(parseExplanation(answer, false)?.factors.map((f) => f.basis)).toEqual(["data", "data"]);
  });

  it("JSON이 아니거나 모양이 틀리면 null", () => {
    expect(parseExplanation("그냥 글", true)).toBeNull();
    expect(parseExplanation(JSON.stringify({ summary: "", factors: [], check: "" }), true)).toBeNull();
  });
});
