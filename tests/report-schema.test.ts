import { describe, expect, it } from "vitest";
import { MAX_SECTION_LENGTH, isEdited, reportUpdateSchema } from "@/lib/report-schema";

describe("보고서 저장 내용 검사", () => {
  it("전체 리스크 수준은 위기·경계·주의·정상 중 하나이거나 아직 고르지 않음", () => {
    for (const overallLevel of ["crisis", "warning", "caution", "normal", null]) {
      expect(reportUpdateSchema.safeParse({ overallLevel, sections: [] }).success).toBe(true);
    }
    expect(reportUpdateSchema.safeParse({ overallLevel: "danger", sections: [] }).success).toBe(false);
  });

  it("분류는 3개 중 하나, 글은 정해진 길이까지", () => {
    const ok = { overallLevel: null, sections: [{ category: "crisis-response", text: "내용" }] };
    expect(reportUpdateSchema.safeParse(ok).success).toBe(true);
    expect(
      reportUpdateSchema.safeParse({ overallLevel: null, sections: [{ category: "risk-management", text: "" }] }).success,
    ).toBe(false);
    const tooLong = { overallLevel: null, sections: [{ category: "macro", text: "가".repeat(MAX_SECTION_LENGTH + 1) }] };
    expect(reportUpdateSchema.safeParse(tooLong).success).toBe(false);
  });
});

describe("고침 표시", () => {
  it("AI 초안과 글이 다르면 고친 것", () => {
    expect(isEdited("초안", "초안 수정")).toBe(true);
    expect(isEdited(null, "직접 씀")).toBe(true);
  });

  it("앞뒤 공백·줄바꿈만 다르거나 같으면 고치지 않은 것", () => {
    expect(isEdited("초안", "초안\n")).toBe(false);
    expect(isEdited(null, "")).toBe(false);
  });
});
