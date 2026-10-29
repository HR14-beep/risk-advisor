// 다시 만들기 API 두 개(전체·섹션)가 같이 쓰는 응답 만들기 (DESIGN.md §6, PLAN 작업 18)
import "server-only";
import { CATEGORIES, type Category } from "@/lib/indicators";
import { todayInKorea } from "@/lib/dates";
import { AiConfigError } from "@/lib/openai";
import { RegenerateError, regenerateReport } from "@/lib/report-generator";
import { StoreConfigError } from "@/lib/supabase";

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export async function regenerateResponse(rawId: string, only?: Category): Promise<Response> {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "보고서를 찾을 수 없어요." }, { status: 404 });

  try {
    const result = await regenerateReport(id, todayInKorea(), only);
    const allFailed = result.sections.length > 0 && result.sections.every((s) => s.error);
    return Response.json(result, { status: allFailed ? 502 : 200 });
  } catch (error) {
    if (error instanceof RegenerateError) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    const message =
      error instanceof StoreConfigError || error instanceof AiConfigError
        ? error.message
        : "저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
    return Response.json({ error: message }, { status: 503 });
  }
}
