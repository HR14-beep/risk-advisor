// 직접 입력 지표 API (DESIGN.md §6, PLAN 작업 9)
// GET: 지표별 마지막 값·기준값과 기준 기간 / POST: 입력값을 검사하고 저장
import { connection } from "next/server";
import { todayInKorea } from "@/lib/dates";
import { getManualInputData, saveManualEntries } from "@/lib/manual-input";
import { parseManualValues } from "@/lib/schemas";
import { StoreConfigError } from "@/lib/supabase";

const STORE_FAILED = "저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";

function storeErrorResponse(error: unknown) {
  console.error(error);
  const message = error instanceof StoreConfigError ? error.message : STORE_FAILED;
  return Response.json({ error: message }, { status: 503 });
}

export async function GET() {
  await connection();
  try {
    return Response.json(await getManualInputData(todayInKorea()));
  } catch (error) {
    return storeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "보낸 내용을 읽지 못했어요." }, { status: 400 });
  }

  // 화면에서 이미 검사했어도, 잘못된 값이 저장소에 들어가지 않도록 서버에서 한 번 더 검사한다
  const result = parseManualValues(body, todayInKorea());
  if (!result.ok) return Response.json({ errors: result.errors }, { status: 400 });

  try {
    return Response.json({ saved: await saveManualEntries(result.entries) });
  } catch (error) {
    return storeErrorResponse(error);
  }
}
