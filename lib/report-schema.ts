// 보고서 저장 내용 검사 (DESIGN.md §3.3, §6 PUT /api/reports/[id], PLAN 작업 17)
import { z } from "zod";
import { CATEGORIES } from "@/lib/indicators";

// 보고서 전체 리스크 수준: AI가 정하지 않고 담당자가 고른다 (PRD 5번 must 2)
export const OVERALL_LEVELS = ["crisis", "warning", "caution", "normal"] as const;
export type OverallLevel = (typeof OVERALL_LEVELS)[number];

export const OVERALL_LEVEL_LABELS: Record<OverallLevel, string> = {
  crisis: "위기",
  warning: "경계",
  caution: "주의",
  normal: "정상",
};

// 분류 하나에 A4 몇 쪽이 넘어도 충분한 길이
export const MAX_SECTION_LENGTH = 30_000;

export const reportUpdateSchema = z.object({
  overallLevel: z.enum(OVERALL_LEVELS, { error: "전체 리스크 수준은 위기·경계·주의·정상 중에서 골라 주세요" }).nullable(),
  sections: z
    .array(
      z.object({
        category: z.enum(CATEGORIES, { error: "알 수 없는 분류입니다" }),
        text: z.string().max(MAX_SECTION_LENGTH, `한 분류는 ${MAX_SECTION_LENGTH.toLocaleString()}자까지 저장할 수 있습니다`),
      }),
    )
    .max(CATEGORIES.length),
});

export type ReportUpdate = z.infer<typeof reportUpdateSchema>;

// 담당자가 고쳤는지: AI 초안과 글이 다르면 고친 것 (앞뒤 공백·줄바꿈 차이는 무시한다)
export function isEdited(aiDraft: string | null, text: string): boolean {
  return text.trim() !== (aiDraft ?? "").trim();
}

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
