import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { todayInKorea } from "@/lib/dates";
import { getManualInputData, type ManualInputData } from "@/lib/manual-input";
import { periodLabel } from "@/lib/period";
import { StoreConfigError } from "@/lib/supabase";
import { CARD, NOTICE_ERROR, NOTICE_INFO } from "@/lib/ui";
import { ManualInputForm } from "./manual-input-form";

export const metadata: Metadata = { title: "직접 입력" };

// 직접 입력 화면 (DESIGN.md §3.2, PLAN 작업 9)

async function InputContent() {
  // 기준월과 저장된 값은 요청할 때마다 새로 구한다
  await connection();
  const today = todayInKorea();

  let data: ManualInputData;
  try {
    data = await getManualInputData(today);
  } catch (error) {
    console.error(error);
    const message =
      error instanceof StoreConfigError ? error.message : "저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
    return (
      <p className={NOTICE_ERROR}>
        {message}
      </p>
    );
  }

  return (
    <>
      <p className="text-sm text-muted">
        {periodLabel(data.period)}분 값을 입력합니다. 이미 저장한 달을 다시 저장하면 새 값으로 바뀝니다.
      </p>
      <ManualInputForm data={data} />
    </>
  );
}

export default function InputPage() {
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">직접 입력</h1>
        <p className="mt-1 text-sm text-muted">공개 API가 없는 위기대응지표의 값과 기준값을 매월 입력합니다.</p>
      </div>
      <p className={NOTICE_INFO}>실습 단계에서는 실제 사내 수치 대신 가상 값만 입력해 주세요.</p>
      <Suspense fallback={<div className={`${CARD} h-96 animate-pulse bg-surface-muted`} aria-label="입력 현황을 불러오는 중" />}>
        <InputContent />
      </Suspense>
    </section>
  );
}
