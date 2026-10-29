// 위험 신호 원인 분석 API (DESIGN.md §4.4, §6, PLAN 작업 22)
// GET: 저장된 분석만 돌려준다 (없으면 explanation: null, AI를 부르지 않음)
// POST {"force": true}: 새로 분석한다. force가 없으면 저장된 분석이 있을 때 그것을 돌려준다
import { connection } from "next/server";
import type { NextRequest } from "next/server";
import { todayInKorea } from "@/lib/dates";
import { explainIndicator, ExplainError, findExplanation } from "@/lib/explain";
import { EXPLAIN_NOTICE } from "@/lib/explain-prompt";
import { AiConfigError, AiError } from "@/lib/openai";
import { StoreConfigError } from "@/lib/supabase";

// 수집(최대 약 30초) + AI(최대 90초)
export const maxDuration = 150;

const STATUS: Record<ExplainError["kind"], number> = { "not-found": 404, "not-risky": 409, limit: 429, invalid: 502 };

function failure(error: unknown) {
  if (error instanceof ExplainError) return Response.json({ error: error.message }, { status: STATUS[error.kind] });
  console.error(error);
  if (error instanceof AiError) {
    const message = error.kind === "timeout" ? "AI 응답이 90초 넘게 없어 멈췄어요. 다시 분석해 주세요." : error.message;
    return Response.json({ error: message }, { status: 502 });
  }
  const message =
    error instanceof StoreConfigError || error instanceof AiConfigError
      ? error.message
      : "저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
  return Response.json({ error: message }, { status: 503 });
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/indicators/[id]/explain">) {
  await connection();
  try {
    const explanation = await findExplanation((await ctx.params).id, todayInKorea());
    return Response.json({ notice: EXPLAIN_NOTICE, explanation });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/indicators/[id]/explain">) {
  await connection();
  const body = (await request.json().catch(() => ({}))) as { force?: unknown };
  try {
    const explanation = await explainIndicator((await ctx.params).id, todayInKorea(), body.force === true);
    return Response.json({ notice: EXPLAIN_NOTICE, explanation });
  } catch (error) {
    return failure(error);
  }
}
