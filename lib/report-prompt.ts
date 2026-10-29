// 보고서 초안 요청 내용과 AI가 지킬 규칙 (PRD 5번 must 2, DESIGN.md §4.3, PLAN 작업 16)
// AI에게는 판정이 끝난 숫자·임계점·단계와 직전 대비 변동만 넘긴다. AI가 판정을 다시 계산하거나 바꾸지 않는다.
import { CATEGORY_LABELS, RISK_LEVELS, RISK_LEVEL_LABELS, type Category } from "@/lib/indicators";
import type { DashboardRow } from "@/lib/dashboard";
import { DISPLAY_STATUS_LABELS, NO_DATA_REASONS, formatChange, formatDay, formatValue } from "@/lib/format";
import { periodLabel } from "@/lib/period";

export const AI_DRAFT_NOTICE = "AI 초안 – 담당자 검토 필요";

export const REPORT_INSTRUCTIONS = `너는 공공기관 리스크관리부의 월간 리스크 보고서 초안을 쓰는 보조자다.
담당자가 검토·수정해 부서장과 임원진에게 보고하므로, 사실만 정확하고 간결하게 쓴다.

[반드시 지킬 규칙]
1. 입력에 적힌 수치만 인용한다. 입력에 없는 수치·통계·뉴스를 쓰지 않고, 새로 계산하지 않으며, 앞으로의 전망이나 예측을 쓰지 않는다.
2. 지표별 판정은 입력의 "판정"을 그대로 쓴다. 판정을 바꾸거나 해석으로 덮어쓰지 않는다.
   - 위험 단계는 [위기] / [경계] / [주의]로 표기한다.
   - 임계점을 넘지 않은 지표는 "정상", 기준 기간 값이 아직 없는 지표는 "발표 전", 값이 없는 지표는 "데이터 없음", 수집에 실패한 지표는 "수집 실패"로 적어 위험 단계와 구분한다.
3. 이 분류 전체나 보고서 전체의 리스크 수준을 정하지 않는다. 전체 리스크 수준은 담당자가 정한다.
4. 지표는 입력에 적힌 순서(임계점을 넘은 지표가 위험한 순서로 맨 앞)대로 다룬다.
5. 변동은 입력의 "직전 대비"(월 지표는 지난달, 분기 지표는 직전 분기) 값으로만 설명한다.
6. "발표 전" 지표는 "발표 전(직전 ○○ 값 참고)"처럼 적고, 직전 값을 이번 기간 값처럼 쓰지 않는다.
7. "수집 실패" 지표는 "수집 실패, 직전 값 기준일 ○○"처럼 적고, 직전 값을 최신 값처럼 쓰지 않는다.
8. 입력에 "실습용 가상 값"으로 표시된 지표는 그 사실을 함께 적는다.
9. 특정 투자·거래(매수·매도·비중 조절 등)를 권유하는 표현은 쓰지 않는다. 대응 제언은 점검·모니터링·관리 강화 같은 리스크 관리 행동으로 쓴다.
10. 보고서 맨 위의 "${AI_DRAFT_NOTICE}" 표시와 분류 제목은 앱이 붙이므로 쓰지 않는다.

[형식]
- 한국어 보고서 문체(~함, ~임)로 쓴다.
- 아래 세 소제목을 이 순서로 쓴다: "1. 변동 요약", "2. 지표별 리스크 수준", "3. 대응 제언"
- 분량은 이 분류에 A4 1쪽 내외(보고서 전체 3~4쪽)로 하되, 내용상 필요하면 넘어도 된다.`;

export type ReportRow = DashboardRow & { isSample: boolean };

function describeRow(row: ReportRow): string {
  const { indicator, period, result, status, previous, change, collectionFailure, deadline, noDataReason } = row;
  const parts = [`지표: ${indicator.name}`, `판정: ${DISPLAY_STATUS_LABELS[status]}`, `기준 기간: ${periodLabel(period)}`];

  if (indicator.components) {
    parts.push(`구성: ${indicator.components.map((c) => `${c.name} ${Math.round(c.weight * 100)}%`).join(" + ")}`);
  }
  if (result) {
    parts.push(`값: ${formatValue(result.value, indicator.unit)}`);
    const sign = indicator.direction === "above" ? "이상" : "이하";
    const thresholds = RISK_LEVELS.flatMap((level) => {
      const threshold = result.thresholds[level];
      return threshold === undefined ? [] : [`${RISK_LEVEL_LABELS[level]} ${formatValue(threshold, indicator.unit)} ${sign}`];
    });
    parts.push(`임계점: ${thresholds.join(", ")}`);
  }
  if (change) parts.push(`직전 대비: ${formatChange(change)} (${periodLabel(change.basePeriod)} 대비)`);
  if (previous?.result && !result) {
    parts.push(`직전 값: ${formatValue(previous.result.value, indicator.unit)} (${periodLabel(previous.period)})`);
  }
  if (status === "notYetPublished" && deadline) parts.push(`발표 예정: ${formatDay(deadline)}까지 (${indicator.publishTiming})`);
  if (noDataReason) parts.push(`사유: ${NO_DATA_REASONS[noDataReason]}`);
  if (collectionFailure) parts.push(`수집 실패, 직전 값 기준일 ${collectionFailure.lastDate ?? "없음"}`);
  if (row.isSample) parts.push("실습용 가상 값");
  return `- ${parts.join(" | ")}`;
}

export function buildSectionInput(category: Category, rows: ReportRow[], reportMonth: string): string {
  return [
    `보고 월: ${periodLabel(reportMonth)}`,
    `분류: ${CATEGORY_LABELS[category]} (${rows.length}개 지표)`,
    "",
    "[지표별 판정 결과]",
    ...rows.map(describeRow),
  ].join("\n");
}

// AI 초안 점검: 입력에 없는 숫자, 투자·거래 권유로 보이는 표현을 찾아 담당자에게 알린다 (고치지는 않는다)
const ADVICE_WORDS = ["매수", "매도", "비중 확대", "비중 축소", "투자 권유", "투자를 권", "추천 종목"];

function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "").replace(/\.0+$/, ""));
}

export function checkDraft(draft: string, input: string): string[] {
  const known = new Set(numbersIn(input));
  const unknown = [
    ...new Set(
      numbersIn(draft).filter((n) => !known.has(n) && !(Number.isInteger(Number(n)) && Number(n) <= 12)),
    ),
  ];
  const warnings: string[] = [];
  if (unknown.length > 0) warnings.push(`입력에 없는 숫자가 있어요: ${unknown.join(", ")}`);
  const advice = ADVICE_WORDS.filter((word) => draft.includes(word));
  if (advice.length > 0) warnings.push(`투자·거래 권유로 보일 수 있는 표현이 있어요: ${advice.join(", ")}`);
  return warnings;
}
