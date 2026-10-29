// 섹션 하나만 다시 만들기 (DESIGN.md §6, PLAN 작업 18): 담당자가 고친 섹션이면 거절한다
import { connection } from "next/server";
import type { NextRequest } from "next/server";
import { isCategory, regenerateResponse } from "@/lib/regenerate-response";

export const maxDuration = 300;

export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/reports/[id]/sections/[category]/regenerate">,
) {
  await connection();
  const { id, category } = await ctx.params;
  if (!isCategory(category)) {
    return Response.json({ error: "분류는 macro, early-warning, crisis-response 중 하나여야 해요." }, { status: 404 });
  }
  return regenerateResponse(id, category);
}
