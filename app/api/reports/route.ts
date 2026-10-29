// 보고서 API (DESIGN.md §6, PLAN 작업 16~17)
// GET ?month=2026-10: 해당 달의 보고서 목록(1차, 2차…) / POST: 보고서 초안을 새로 만들어 새 차수로 저장
import { connection } from "next/server";
import { todayInKorea } from "@/lib/dates";
import { AiConfigError } from "@/lib/openai";
import { AI_DRAFT_NOTICE } from "@/lib/report-prompt";
import { generateReport } from "@/lib/report-generator";
import { MONTH_PATTERN } from "@/lib/report-schema";
import { listReports } from "@/lib/report-store";
import { StoreConfigError } from "@/lib/supabase";

// 분류 3개를 동시에 만들어도 몇십 초 걸릴 수 있다
export const maxDuration = 300;

function failure(error: unknown) {
  console.error(error);
  const message =
    error instanceof StoreConfigError || error instanceof AiConfigError
      ? error.message
      : "저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
  return Response.json({ error: message }, { status: 503 });
}

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!MONTH_PATTERN.test(month)) {
    return Response.json({ error: "month는 2026-10처럼 적어 주세요." }, { status: 400 });
  }
  try {
    return Response.json({ month, reports: await listReports(month) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST() {
  await connection();
  try {
    const { report, sections, notices } = await generateReport(todayInKorea());
    const failed = sections.filter((s) => s.error).length;
    return Response.json(
      { notice: AI_DRAFT_NOTICE, report, sections, notices },
      // 일부 분류만 실패해도 보고서는 저장됐으므로 성공으로 돌려주고, 실패한 분류는 sections[].error로 알린다
      { status: failed === sections.length ? 502 : 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
