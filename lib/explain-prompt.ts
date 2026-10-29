// 위험 신호 원인 분석: AI에게 넘길 내용과 지킬 규칙 (DESIGN.md §4.4, PLAN 작업 22)
// 지표 현황에서 위기·경계·주의로 판정된 지표를 누르면, 앱 데이터(+공개 통계 지표는 웹 검색)를 근거로 원인 후보를 짧게 정리한다.
// AI는 판정을 바꾸지 않고, 원인을 단정하거나 전망·투자 권유를 쓰지 않는다.
import { z } from "zod";
import { DISPLAY_STATUS_LABELS, formatChange, formatNumber, formatValue } from "@/lib/format";
import type { DashboardRow, DisplayStatus } from "@/lib/dashboard";
import { mean, standardDeviation, type SeriesById } from "@/lib/judge";
import { aggregateByPeriod, historyLength, periodLabel, previousPeriods, type PeriodKey } from "@/lib/period";
import { describeRow, type ReportRow } from "@/lib/report-prompt";

export const EXPLAIN_NOTICE = "AI 분석 – 원인 후보이며 담당자 확인 필요";

// 원인 분석 버튼을 보여 줄 단계
export const EXPLAINABLE: DisplayStatus[] = ["crisis", "warning", "caution"];

// 최근 흐름으로 넘길 기간 수 (월 12개, 분기 8개)
const RECENT = { monthly: 12, daily: 12, quarterly: 8 } as const;

export function explainInstructions(webSearch: boolean): string {
  return `너는 공공기관 리스크관리부 담당자를 돕는 분석 보조자다.
지표 현황에서 위험 단계로 판정된 지표 하나에 대해, 왜 위험 신호가 켜졌는지 원인 후보를 짧게 정리한다.

[반드시 지킬 규칙]
1. 판정(단계)은 입력에 적힌 그대로다. 단계를 바꾸거나 새로 계산하지 않는다.
2. 숫자는 입력에 적힌 수치만 쓴다. 새로 계산하거나 입력에 없는 수치를 만들지 않는다.
3. 원인을 단정하지 않는다. "~영향으로 보임", "~가 함께 나타남", "~로 꼽힘"처럼 후보로 쓴다.
4. 앞으로의 전망·예측, 특정 투자·거래(매수·매도·비중 조절) 권유를 쓰지 않는다.
5. 입력에 "실습용 가상 값"이 있으면 summary에 그 사실을 적는다.
${
  webSearch
    ? `6. 웹 검색으로 이 지표가 움직인 배경(정책·금리·업황 등)을 찾아볼 수 있다. 한국 언론·공공기관 자료를 우선하고, 기준 기간 전후 6개월 안의 자료만 쓴다.
   - 검색으로 찾은 내용은 basis를 "news"로 하고 반드시 출처를 인용한다. 기사 속 수치는 옮기지 않는다.
   - 관련 자료를 찾지 못하면 지어내지 말고 입력 데이터만으로 쓴다.
7. 앱 데이터에서 나온 내용은 basis를 "data"로 한다.`
    : `6. 웹 검색은 쓰지 않는다(사내 데이터 지표). 모든 내용은 입력 데이터에서만 나오며 basis는 "data"다.`
}

[형식] 한국어 보고서 문체(~함, ~임)로 짧게 쓴다.
- summary: 한두 문장 요약
- factors: 원인 후보 2~4개, 각 한 문장
- check: 담당자가 확인해 볼 점 한 문장`;
}

export const EXPLAIN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "factors", "check"],
  properties: {
    summary: { type: "string" },
    factors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "basis"],
        properties: { text: { type: "string" }, basis: { type: "string", enum: ["data", "news"] } },
      },
    },
    check: { type: "string" },
  },
} as const;

export const ExplanationSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  factors: z
    .array(z.object({ text: z.string().trim().min(1).max(400), basis: z.enum(["data", "news"]) }))
    .min(1)
    .max(6),
  check: z.string().trim().max(400),
});

export type ExplanationBody = z.infer<typeof ExplanationSchema>;

// AI 답(JSON 글)을 검사한다. 웹 검색을 쓰지 않았는데 "news"라고 하면 "data"로 바꾼다
export function parseExplanation(text: string, webSearch: boolean): ExplanationBody | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = ExplanationSchema.safeParse(raw);
  if (!parsed.success) return null;
  return webSearch
    ? parsed.data
    : { ...parsed.data, factors: parsed.data.factors.map((f) => ({ ...f, basis: "data" as const })) };
}

// 가중합 지표: 구성값마다 그 기간 값이 5년 평균에서 얼마나 벗어났고(표준점수), 점수에 얼마나 보탰는지
export function componentContributions(row: DashboardRow, seriesById: SeriesById): string[] {
  const { indicator, period } = row;
  if (!indicator.components) return [];
  const windowKeys = previousPeriods(period, historyLength(indicator.publicationCycle));
  return indicator.components.flatMap((c) => {
    const periods = aggregateByPeriod(seriesById[c.id] ?? [], indicator.publicationCycle);
    const current = periods.get(period)?.value;
    const window = windowKeys.flatMap((k) => (periods.has(k) ? [periods.get(k)!.value] : []));
    if (current === undefined || window.length < 2) return [];
    const sd = standardDeviation(window);
    if (!(sd > 0)) return [];
    const z = (current - mean(window)) / sd;
    const contribution = (c.sign ?? 1) * c.weight * z;
    return [
      `${c.name}: ${formatValue(current, c.unit ?? "")} (5년 평균 ${formatNumber(mean(window))}, 표준점수 ${formatNumber(z)}${c.sign === -1 ? ", 하락 시 위험" : ""}) → 점수 기여 ${contribution >= 0 ? "+" : ""}${formatNumber(contribution)}`,
    ];
  });
}

// 기준 기간까지 최근 값 (가중합 지표는 구성값을 따로 보여 주므로 넣지 않는다)
function recentValues(row: DashboardRow, seriesById: SeriesById): string | null {
  const { indicator, period } = row;
  if (indicator.components) return null;
  const periods = aggregateByPeriod(seriesById[indicator.id] ?? [], indicator.publicationCycle);
  const keys: PeriodKey[] = [...previousPeriods(period, RECENT[indicator.publicationCycle] - 1), period];
  const values = keys.flatMap((k) => (periods.has(k) ? [`${periodLabel(k)} ${formatValue(periods.get(k)!.value, indicator.unit)}`] : []));
  return values.length > 0 ? values.join(", ") : null;
}

export function buildExplainInput(row: ReportRow, allRows: ReportRow[], seriesById: SeriesById): string {
  const { indicator } = row;
  const risky = indicator.direction === "above" ? "오를수록 위험" : "내릴수록 위험";
  const recent = recentValues(row, seriesById);
  const components = componentContributions(row, seriesById);
  const others = allRows
    .filter((r) => r.indicator.id !== indicator.id && EXPLAINABLE.includes(r.status))
    .map(
      (r) =>
        `- ${r.indicator.name}: ${DISPLAY_STATUS_LABELS[r.status]}${r.change ? `, 직전 대비 ${formatChange(r.change)}` : ""}${r.isSample ? " (실습용 가상 값)" : ""}`,
    );

  return [
    "[분석할 지표]",
    describeRow(row, seriesById),
    `  · 위험 방향: ${risky}`,
    `  · 출처: ${indicator.source.name}`,
    ...(recent ? [`  · 최근 값: ${recent}`] : []),
    ...(components.length > 0 ? ["  · 구성값별 기여:", ...components.map((c) => `    - ${c}`)] : []),
    "",
    "[같은 시점에 위험 단계인 다른 지표]",
    ...(others.length > 0 ? others : ["- 없음"]),
  ].join("\n");
}
