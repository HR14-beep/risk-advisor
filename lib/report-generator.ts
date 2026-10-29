// 보고서 초안 만들기와 다시 만들기 (DESIGN.md §4.3, PLAN 작업 16, 18)
// 최신 판정 결과를 모아 → 분류마다 OpenAI에 따로 요청 → 저장한다.
// 분류마다 따로 요청하므로 한 분류가 실패해도 나머지는 저장되고, 실패한 분류만 다시 만들면 된다.
import "server-only";
import { INDICATORS, type Category } from "@/lib/indicators";
import { buildDashboard, type DashboardSection } from "@/lib/dashboard";
import { loadDashboardData } from "@/lib/dashboard-data";
import type { SeriesById } from "@/lib/judge";
import { assertAiConfigured, generateText } from "@/lib/openai";
import { REPORT_INSTRUCTIONS, buildSectionInput, checkDraft } from "@/lib/report-prompt";
import {
  createReport,
  getReport,
  replaceAiDraft,
  saveSections,
  type ReportRecord,
  type ReportWithSections,
} from "@/lib/report-store";

// 분류 하나(A4 1쪽 남짓)에 충분한 길이. 생각하는 모델은 생각에 쓰는 몫도 여기서 나간다
const MAX_OUTPUT_TOKENS = 16_000;

export type GeneratedSection = {
  category: Category;
  label: string;
  aiDraft: string | null;
  error: string | null; // 생성 실패 이유 (화면에 "생성 실패" + 다시 만들기)
  warnings: string[]; // 담당자가 확인할 점 (입력에 없는 숫자 등)
};

export type GeneratedReport = { report: ReportRecord; sections: GeneratedSection[]; notices: string[] };

// 지금의 판정 결과를 분류별로 모은다
type Current = { sections: DashboardSection[]; series: SeriesById; sampleIds: Set<string>; notices: string[] };

async function currentSections(today: string): Promise<Current> {
  const { series, sampleIds, failedIds, notices } = await loadDashboardData(today);
  const { sections } = buildDashboard(INDICATORS, series, today, failedIds);
  return { sections, series, sampleIds, notices };
}

async function generateSection(section: DashboardSection, current: Current, reportMonth: string): Promise<GeneratedSection> {
  const rows = section.rows.map((row) => ({ ...row, isSample: current.sampleIds.has(row.indicator.id) }));
  const input = buildSectionInput(section.category, rows, reportMonth, current.series);
  const base = { category: section.category, label: section.label };
  try {
    const { text } = await generateText({ instructions: REPORT_INSTRUCTIONS, input, maxOutputTokens: MAX_OUTPUT_TOKENS });
    return { ...base, aiDraft: text, error: null, warnings: checkDraft(text, input) };
  } catch (error) {
    console.error(error);
    return { ...base, aiDraft: null, error: (error as Error).message, warnings: [] };
  }
}

export async function generateReport(today: string): Promise<GeneratedReport> {
  // AI 설정이 없으면 빈 보고서를 남기지 않도록 아무것도 하기 전에 멈춘다
  assertAiConfigured();
  const reportMonth = today.slice(0, 7);
  const current = await currentSections(today);
  const { sections, notices } = current;

  // 저장소에 보고서 자리부터 만든다 (저장소에 문제가 있으면 AI를 부르기 전에 멈춘다)
  const report = await createReport(reportMonth);
  const generated = await Promise.all(sections.map((section) => generateSection(section, current, reportMonth)));

  await saveSections(
    report.id,
    generated.map((s) => ({ category: s.category, aiDraft: s.aiDraft })),
  );
  return { report, sections: generated, notices };
}

// 다시 만들 수 없을 때 (화면에 그대로 보여 줄 문구)
export class RegenerateError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409,
  ) {
    super(message);
    this.name = "RegenerateError";
  }
}

export type RegeneratedReport = {
  report: ReportWithSections;
  sections: GeneratedSection[]; // 다시 만든 분류만
  skipped: Category[]; // 담당자가 고쳐서 건너뛴 분류
  notices: string[];
};

// 다시 만들기: 담당자가 고친 섹션([고침])은 건너뛰고, 나머지 섹션의 AI 초안만 새로 쓴다.
// only를 주면 그 분류만 다시 만들고, 그 분류를 고쳤으면 거절한다.
// 다시 만들다 실패하면 이전 AI 초안은 그대로 둔다.
export async function regenerateReport(id: number, today: string, only?: Category): Promise<RegeneratedReport> {
  assertAiConfigured();
  const report = await getReport(id);
  if (!report) throw new RegenerateError("보고서를 찾을 수 없어요.", 404);
  // 다시 만들면 지금의 지표로 쓰므로, 지난달 보고서는 고치지 않는다 (새 초안을 만들어야 한다)
  if (report.report_month !== today.slice(0, 7)) {
    throw new RegenerateError("지난달 보고서는 다시 만들 수 없어요. 이번 달 새 초안을 만들어 주세요.", 409);
  }

  const targets = report.sections.filter((s) => !only || s.category === only);
  if (only && targets.length === 0) throw new RegenerateError("해당 분류를 찾을 수 없어요.", 404);
  if (only && targets[0].is_edited) {
    throw new RegenerateError("담당자가 고친 섹션은 다시 만들지 않아요. 고친 내용을 되돌린 뒤 다시 시도해 주세요.", 409);
  }
  const skipped = targets.filter((s) => s.is_edited).map((s) => s.category);
  const toRegenerate = targets.filter((s) => !s.is_edited);

  const current = await currentSections(today);
  const { sections, notices } = current;
  const generated = await Promise.all(
    toRegenerate.map((target) =>
      generateSection(sections.find((s) => s.category === target.category)!, current, report.report_month),
    ),
  );

  for (const result of generated) {
    if (result.aiDraft === null) continue;
    const section = toRegenerate.find((s) => s.category === result.category)!;
    // 그 사이 담당자가 저장해 [고침]이 되었으면 덮어쓰지 않는다
    const replaced = await replaceAiDraft(section.id, result.aiDraft);
    if (!replaced) {
      skipped.push(result.category);
      result.aiDraft = null;
      result.error = "그 사이 담당자가 고쳐 저장해서 다시 만들지 않았어요.";
    }
  }

  return { report: (await getReport(id))!, sections: generated, skipped, notices };
}
