// 지표 업데이트 메일 알림 예약 실행 주소 (DESIGN.md §7-1, PLAN 작업 20)
// Vercel 예약 실행(vercel.json)이 매주 월·금 00:00 UTC(한국 오전 9시)에 부른다.
// CRON_SECRET이 있어야만 실행된다. Vercel은 이 값을 Authorization 머리말에 자동으로 넣어 보낸다.
// ?preview=1 을 붙이면 메일을 보내지 않고 담길 내용만 돌려준다.
import { connection } from "next/server";
import type { NextRequest } from "next/server";
import { todayInKorea } from "@/lib/dates";
import { MailConfigError, MailError } from "@/lib/mailer";
import { runNotification } from "@/lib/notify";
import { StoreConfigError } from "@/lib/supabase";

// 수집(은행 20곳 등)과 메일 발송까지 넉넉히
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET이 설정되지 않았어요." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "권한이 없어요." }, { status: 401 });
  }

  const preview = request.nextUrl.searchParams.get("preview") === "1";
  try {
    const result = await runNotification(todayInKorea(), { preview });
    return Response.json({ preview, ...result });
  } catch (error) {
    console.error(error);
    const known = error instanceof MailConfigError || error instanceof MailError || error instanceof StoreConfigError;
    return Response.json({ error: known ? (error as Error).message : "알림을 보내지 못했어요." }, { status: 503 });
  }
}
