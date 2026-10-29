// 지표 현황 API (DESIGN.md §4.1, §6, PLAN 작업 12)
// 과거 값 불러오기 → 새 값 수집 → 저장 → 판정 후 22개 지표 결과를 돌려준다.
// 지표 현황 화면(app/page.tsx)은 같은 함수를 서버에서 바로 부르고, 이 주소는 다른 곳(보고서 등)에서 결과가 필요할 때 쓴다.
import { connection } from "next/server";
import { INDICATORS } from "@/lib/indicators";
import { todayInKorea } from "@/lib/dates";
import { buildDashboard } from "@/lib/dashboard";
import { loadDashboardData } from "@/lib/dashboard-data";

export async function GET() {
  await connection();
  const today = todayInKorea();
  const { series, sampleIds, failedIds, notices } = await loadDashboardData(today);
  const { sections, counts } = buildDashboard(INDICATORS, series, today, failedIds);

  return Response.json({
    today,
    collectedAt: new Date().toISOString(),
    counts,
    notices,
    sections: sections.map((section) => ({
      category: section.category,
      label: section.label,
      rows: section.rows.map(({ indicator, ...row }) => ({
        id: indicator.id,
        name: indicator.name,
        unit: indicator.unit,
        collectionMethod: indicator.collectionMethod,
        source: indicator.source,
        isSample: sampleIds.has(indicator.id),
        ...row,
      })),
    })),
  });
}
