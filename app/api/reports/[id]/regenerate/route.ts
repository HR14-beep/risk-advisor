// 전체 다시 만들기 (DESIGN.md §6, PLAN 작업 18): 담당자가 고친 섹션은 건너뛴다
import { connection } from "next/server";
import type { NextRequest } from "next/server";
import { regenerateResponse } from "@/lib/regenerate-response";

// 분류 3개를 동시에 다시 만들어도 몇십 초 걸릴 수 있다
export const maxDuration = 300;

export async function POST(_request: NextRequest, ctx: RouteContext<"/api/reports/[id]/regenerate">) {
  await connection();
  return regenerateResponse((await ctx.params).id);
}
