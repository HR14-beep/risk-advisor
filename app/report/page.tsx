import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getReport, latestReport, listReports, type ReportRecord, type ReportWithSections } from "@/lib/report-store";
import { StoreConfigError } from "@/lib/supabase";
import { ROUTES } from "@/lib/site";
import { CreateReportButton, ReportEditor } from "./report-editor";

export const metadata: Metadata = { title: "보고서" };

// 보고서 화면 (DESIGN.md §3.3, PLAN 작업 17). 주소 ?id=보고서 번호로 고른 보고서를 연다

type Loaded = { report: ReportWithSections | null; siblings: ReportRecord[]; missing: boolean };

async function load(rawId: string | string[] | undefined): Promise<Loaded> {
  const requested = typeof rawId === "string" ? Number(rawId) : null;
  const id = requested ?? (await latestReport())?.id ?? null;
  const report = id && Number.isInteger(id) ? await getReport(id) : null;
  const siblings = report ? await listReports(report.report_month) : [];
  return { report, siblings, missing: requested !== null && !report };
}

async function ReportContent({ searchParams }: { searchParams: PageProps<"/report">["searchParams"] }) {
  const { id } = await searchParams;

  let loaded: Loaded;
  try {
    loaded = await load(id);
  } catch (error) {
    console.error(error);
    const message =
      error instanceof StoreConfigError ? error.message : "저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
    return (
      <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
        {message}
      </p>
    );
  }

  if (!loaded.report) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-black/20 p-6 dark:border-white/25">
        <p>{loaded.missing ? "찾는 보고서가 없어요." : "아직 만든 보고서가 없어요."}</p>
        <p className="text-sm text-black/60 dark:text-white/60">
          지금의 지표 판정 결과로 AI가 분류별 초안을 씁니다. 몇십 초 걸릴 수 있어요.
        </p>
        <CreateReportButton />
      </div>
    );
  }

  // 보고서가 바뀌면 고치던 내용을 새로 불러오도록 key를 준다
  return <ReportEditor key={loaded.report.id} report={loaded.report} siblings={loaded.siblings} />;
}

export default function ReportPage({ searchParams }: PageProps<"/report">) {
  return (
    <section className="flex flex-col gap-4">
      <Link href={ROUTES.dashboard} className="text-sm underline">
        ← 지표 현황으로
      </Link>
      <Suspense fallback={<p className="text-sm">보고서를 불러오는 중…</p>}>
        <ReportContent searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
