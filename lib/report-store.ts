// 보고서 저장하고 불러오기 (DESIGN.md §5.2, PLAN 작업 16~17)
// 같은 달에 초안을 다시 만들면 덮어쓰지 않고 새 차수(2차, 3차…)로 저장한다.
// AI 초안(ai_draft)과 담당자 수정본(edited_text)을 따로 보관해, 다시 만들어도 고친 글은 남긴다.
import "server-only";
import { CATEGORIES, type Category } from "@/lib/indicators";
import { getSupabase } from "@/lib/supabase";
import { StoreError } from "@/lib/value-store";
import { isEdited, type OverallLevel, type ReportUpdate } from "@/lib/report-schema";

export type ReportRecord = {
  id: number;
  report_month: string;
  round: number;
  overall_level: OverallLevel | null;
  created_at: string;
  saved_at: string | null;
};

export type SectionRecord = {
  id: number;
  report_id: number;
  category: Category;
  ai_draft: string | null;
  edited_text: string | null;
  is_edited: boolean;
};

export type ReportWithSections = ReportRecord & { sections: SectionRecord[] };

// 같은 차수를 동시에 만들려고 하면(두 번 누름) 다음 차수로 다시 시도한다
const MAX_ROUND_RETRIES = 3;

async function nextRound(month: string): Promise<number> {
  const { data, error } = await getSupabase()
    .from("reports")
    .select("round")
    .eq("report_month", month)
    .order("round", { ascending: false })
    .limit(1);
  if (error) throw new StoreError("보고서 차수를 확인", error);
  return (data[0]?.round ?? 0) + 1;
}

export async function createReport(month: string): Promise<ReportRecord> {
  for (let attempt = 0; attempt < MAX_ROUND_RETRIES; attempt++) {
    const round = await nextRound(month);
    const { data, error } = await getSupabase()
      .from("reports")
      .insert({ report_month: month, round })
      .select()
      .single();
    if (!error) return data as ReportRecord;
    // 23505: 같은 달·같은 차수가 이미 있음
    if (error.code !== "23505") throw new StoreError("보고서를 만들", error);
  }
  throw new StoreError("보고서를 만들", { message: "차수가 겹쳐 저장하지 못했습니다. 다시 시도해 주세요." });
}

// AI 초안을 분류별로 저장한다. 생성에 실패한 분류는 초안을 비워 두어 "다시 만들기"로 채운다
export async function saveSections(
  reportId: number,
  sections: { category: Category; aiDraft: string | null }[],
): Promise<void> {
  const { error } = await getSupabase()
    .from("report_sections")
    .insert(sections.map((s) => ({ report_id: reportId, category: s.category, ai_draft: s.aiDraft })));
  if (error) throw new StoreError("보고서 섹션을 저장", error);
}

// 다시 만든 AI 초안으로 바꾼다. 담당자가 고친 섹션([고침])이면 바꾸지 않고 false를 돌려준다
export async function replaceAiDraft(sectionId: number, aiDraft: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("report_sections")
    .update({ ai_draft: aiDraft })
    .eq("id", sectionId)
    .eq("is_edited", false)
    .select("id");
  if (error) throw new StoreError("다시 만든 초안을 저장", error);
  return data.length > 0;
}

// 해당 달의 보고서 목록 (1차부터)
export async function listReports(month: string): Promise<ReportRecord[]> {
  const { data, error } = await getSupabase()
    .from("reports")
    .select("*")
    .eq("report_month", month)
    .order("round");
  if (error) throw new StoreError("보고서 목록을 불러오", error);
  return data as ReportRecord[];
}

// 가장 최근에 만든 보고서 (보고서 화면을 처음 열 때)
export async function latestReport(): Promise<ReportRecord | null> {
  const { data, error } = await getSupabase()
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new StoreError("보고서를 불러오", error);
  return (data[0] as ReportRecord | undefined) ?? null;
}

// 보고서 하나와 분류별 섹션 (분류 순서대로). 없으면 null
export async function getReport(id: number): Promise<ReportWithSections | null> {
  const { data, error } = await getSupabase()
    .from("reports")
    .select("*, sections:report_sections(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new StoreError("보고서를 불러오", error);
  if (!data) return null;
  const report = data as ReportWithSections;
  report.sections.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));
  return report;
}

// 담당자 수정본과 전체 리스크 수준을 저장한다. AI 초안과 같아지면 [고침] 표시를 지운다
export async function updateReport(id: number, update: ReportUpdate): Promise<ReportWithSections | null> {
  const current = await getReport(id);
  if (!current) return null;

  for (const section of update.sections) {
    const existing = current.sections.find((s) => s.category === section.category);
    if (!existing) continue;
    const edited = isEdited(existing.ai_draft, section.text);
    const { error } = await getSupabase()
      .from("report_sections")
      .update({ edited_text: edited ? section.text : null, is_edited: edited })
      .eq("id", existing.id);
    if (error) throw new StoreError("보고서 섹션을 저장", error);
  }

  const { error } = await getSupabase()
    .from("reports")
    .update({ overall_level: update.overallLevel, saved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new StoreError("보고서를 저장", error);

  return getReport(id);
}
