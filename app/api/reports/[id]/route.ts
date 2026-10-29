// 보고서 하나 API (DESIGN.md §6, PLAN 작업 17)
// GET: 저장된 보고서와 섹션 3개 / PUT: 담당자 수정본과 전체 리스크 수준 저장
import type { NextRequest } from "next/server";
import { reportUpdateSchema } from "@/lib/report-schema";
import { getReport, updateReport } from "@/lib/report-store";
import { StoreConfigError } from "@/lib/supabase";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function failure(error: unknown) {
  console.error(error);
  const message =
    error instanceof StoreConfigError ? error.message : "저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
  return Response.json({ error: message }, { status: 503 });
}

const notFound = () => Response.json({ error: "보고서를 찾을 수 없어요." }, { status: 404 });

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/reports/[id]">) {
  const id = parseId((await ctx.params).id);
  if (!id) return notFound();
  try {
    const report = await getReport(id);
    return report ? Response.json(report) : notFound();
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/reports/[id]">) {
  const id = parseId((await ctx.params).id);
  if (!id) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "보낸 내용을 읽지 못했어요." }, { status: 400 });
  }
  const parsed = reportUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "저장할 내용을 확인해 주세요." }, { status: 400 });
  }

  try {
    const report = await updateReport(id, parsed.data);
    return report ? Response.json(report) : notFound();
  } catch (error) {
    return failure(error);
  }
}
