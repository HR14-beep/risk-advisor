import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { INDICATORS, RISK_LEVELS, RISK_LEVEL_LABELS, type IndicatorDefinition, type SourceLink } from "@/lib/indicators";
import { todayInKorea } from "@/lib/dates";
import { loadDashboardData } from "@/lib/dashboard-data";
import {
  buildDashboard,
  DISPLAY_STATUSES,
  type DashboardRow,
  type DisplayStatus,
} from "@/lib/dashboard";
import type { JudgeResult } from "@/lib/judge";
import { DISPLAY_STATUS_LABELS, NO_DATA_REASONS, formatChange, formatDay, formatValue } from "@/lib/format";
import { periodLabel, referencePeriod } from "@/lib/period";
import { ROUTES } from "@/lib/site";

// 지표 현황 화면 (DESIGN.md §3.1, PLAN 작업 6~7)
// 자동 수집·저장소 값을 쓰고, 값이 없는 지표는 lib/sample-values.ts의 가상 값으로 보여 준다 (lib/dashboard-data.ts)

const STATUS_STYLES: Record<DisplayStatus, { label: string; badge: string; card: string }> = {
  crisis: {
    label: DISPLAY_STATUS_LABELS.crisis,
    badge: "bg-red-600 text-white",
    card: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
  },
  warning: {
    label: DISPLAY_STATUS_LABELS.warning,
    badge: "bg-orange-500 text-white",
    card: "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-100",
  },
  caution: {
    label: DISPLAY_STATUS_LABELS.caution,
    badge: "bg-yellow-300 text-yellow-950",
    card: "border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-100",
  },
  normal: {
    label: DISPLAY_STATUS_LABELS.normal,
    badge: "bg-green-600 text-white",
    card: "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100",
  },
  notYetPublished: {
    label: DISPLAY_STATUS_LABELS.notYetPublished,
    badge: "bg-sky-600 text-white",
    card: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
  },
  collectionFailed: {
    label: DISPLAY_STATUS_LABELS.collectionFailed,
    badge: "bg-purple-600 text-white",
    card: "border-purple-300 bg-purple-50 text-purple-900 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-100",
  },
  noData: {
    label: DISPLAY_STATUS_LABELS.noData,
    badge: "bg-gray-400 text-white dark:bg-gray-600",
    card: "border-gray-300 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200",
  },
};

const muted = "text-black/60 dark:text-white/60";

function formatKoreaTime(now: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
}

function StatusBadge({ status }: { status: DisplayStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-sm font-bold ${style.badge}`}>
      {style.label}
    </span>
  );
}

// 판정에 쓴 임계점 (예: "경계 ≥ 0.52%")
function ThresholdNote({ indicator, result }: { indicator: IndicatorDefinition; result: JudgeResult }) {
  const sign = indicator.direction === "above" ? "≥" : "≤";
  // 주의 → 경계 → 위기 순서로 읽히게 한다
  const parts = [...RISK_LEVELS].reverse().flatMap((level) => {
    const threshold = result.thresholds[level];
    return threshold === undefined
      ? []
      : [`${RISK_LEVEL_LABELS[level]} ${sign} ${formatValue(threshold, indicator.unit)}`];
  });
  return <div className={`text-xs ${muted}`}>{parts.join(" · ")}</div>;
}

function SourceLinks({ indicator }: { indicator: IndicatorDefinition }) {
  const sources: SourceLink[] = indicator.components
    ? [...new Map(indicator.components.map((c) => [c.source.name, c.source])).values()]
    : [indicator.source];
  return (
    <div className="flex flex-col gap-0.5">
      {sources.map((source) =>
        source.url ? (
          <a
            key={source.name}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 underline underline-offset-2 dark:text-blue-300"
          >
            {source.name}
          </a>
        ) : (
          <span key={source.name}>{source.name}</span>
        ),
      )}
    </div>
  );
}

function IndicatorName({ indicator }: { indicator: IndicatorDefinition }) {
  return (
    <>
      <div>{indicator.name}</div>
      {indicator.components && (
        <div className={`text-xs ${muted}`}>
          {indicator.components.map((c) => `${c.name} ${Math.round(c.weight * 100)}%`).join(" · ")}
        </div>
      )}
    </>
  );
}

function IndicatorRow({ row, isSample }: { row: DashboardRow; isSample: boolean }) {
  const { indicator, period, result, status, noDataReason, deadline, needsUpdate, previous, change, collectionFailure } =
    row;
  const exceeded = status === "crisis" || status === "warning" || status === "caution";
  const dash = <span className="text-black/50 dark:text-white/50">—</span>;

  return (
    <tr className={`border-t border-black/10 align-top dark:border-white/15 ${exceeded ? "font-medium" : ""}`}>
      <td className="px-3 py-2">
        <IndicatorName indicator={indicator} />
      </td>
      <td className="px-3 py-2 text-right">
        {result ? (
          <>
            <div>{formatValue(result.value, indicator.unit)}</div>
            <ThresholdNote indicator={indicator} result={result} />
          </>
        ) : previous?.result ? (
          // 발표 전·수집 실패: 직전 값을 흐리게 보여 준다 (판정에는 쓰지 않는다)
          <div className={muted}>
            <div>{formatValue(previous.result.value, indicator.unit)}</div>
            <div className="text-xs">{periodLabel(previous.period)} 값</div>
          </div>
        ) : (
          dash
        )}
      </td>
      <td className="px-3 py-2 text-right">{change ? formatChange(change) : dash}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={status} />
          {noDataReason && <span className={`text-xs ${muted}`}>{NO_DATA_REASONS[noDataReason]}</span>}
          {status === "notYetPublished" && deadline && (
            <span className={`text-xs ${muted}`}>
              {indicator.collectionMethod === "manual"
                ? `${formatDay(deadline)}까지 입력`
                : `${indicator.publishTiming} 발표 (${formatDay(deadline)}까지)`}
            </span>
          )}
          {status === "notYetPublished" && previous?.result && (
            <span className={`text-xs ${muted}`}>
              직전 판정: {STATUS_STYLES[previous.result.status].label}
            </span>
          )}
          {collectionFailure &&
            (status === "collectionFailed" ? (
              <span className={`text-xs ${muted}`}>
                수집 실패, 직전 값 기준일 {collectionFailure.lastDate ?? "없음"}
              </span>
            ) : (
              // 기준 기간 값은 이미 저장돼 있어 판정은 그대로 하고, 이번 수집 실패만 알린다
              <span className="rounded border border-purple-500 px-1.5 text-xs text-purple-700 dark:text-purple-300">
                이번 수집 실패 · 저장된 값 기준일 {collectionFailure.lastDate}
              </span>
            ))}
          {needsUpdate && (
            <span className="rounded border border-amber-500 px-1.5 text-xs text-amber-700 dark:text-amber-300">
              갱신 필요
            </span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2">{periodLabel(period)}</td>
      <td className="px-3 py-2">
        <SourceLinks indicator={indicator} />
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <div>{indicator.collectionMethod === "auto" ? "자동" : "직접 입력"}</div>
        {isSample && <div className={`text-xs ${muted}`}>가상 값</div>}
      </td>
    </tr>
  );
}

async function DashboardContent() {
  // 오늘 날짜와 수집 시각은 요청할 때마다 새로 구한다
  await connection();
  const now = new Date();
  const today = todayInKorea(now);
  const { series, sampleIds, failedIds, notices } = await loadDashboardData(today);
  const { sections, counts } = buildDashboard(INDICATORS, series, today, failedIds);

  return (
    <>
      {notices.length > 0 && (
        <ul className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {notices.map((notice) => (
            <li key={notice}>⚠ {notice}</li>
          ))}
        </ul>
      )}

      <p className="text-sm text-black/70 dark:text-white/70">
        점검 기준: {periodLabel(referencePeriod("monthly", today))}분 (분기 지표는{" "}
        {periodLabel(referencePeriod("quarterly", today))}분) · 마지막 수집: {formatKoreaTime(now)}
      </p>

      {/* ② 요약 카드 */}
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {DISPLAY_STATUSES.map((status) => (
          <li key={status} className={`rounded-lg border px-4 py-3 ${STATUS_STYLES[status].card}`}>
            <div className="text-sm">{STATUS_STYLES[status].label}</div>
            <div className="text-2xl font-bold">{counts[status]}</div>
          </li>
        ))}
      </ul>

      {/* ③ 분류별 표 */}
      {sections.map((section) => (
        <details key={section.category} open className="rounded-lg border border-black/10 dark:border-white/15">
          <summary className="cursor-pointer px-4 py-3 font-bold">
            {section.label} ({section.rows.length})
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed text-sm">
              {/* 세 분류의 표가 같은 칸 너비를 쓰도록 고정한다 */}
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
                <col className="w-[16%]" />
                <col className="w-[11%]" />
                <col className="w-[14%]" />
                <col className="w-[9%]" />
              </colgroup>
              <thead className="whitespace-nowrap bg-black/5 text-left dark:bg-white/10">
                <tr>
                  <th className="px-3 py-2">지표명</th>
                  <th className="px-3 py-2 text-right">현재 값</th>
                  <th className="px-3 py-2 text-right">직전 대비</th>
                  <th className="px-3 py-2">단계</th>
                  <th className="px-3 py-2">기준 기간</th>
                  <th className="px-3 py-2">확인 위치</th>
                  <th className="px-3 py-2">방식</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row) => (
                  <IndicatorRow key={row.indicator.id} row={row} isSample={sampleIds.has(row.indicator.id)} />
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </>
  );
}

export default function DashboardPage() {
  return (
    <section className="flex flex-col gap-4">
      {/* ① 상단 바 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">지표 현황</h1>
        <nav className="flex flex-wrap gap-2">
          {/* 화면을 다시 열면 수집·판정을 새로 한다 */}
          <a
            href={ROUTES.dashboard}
            className="rounded border border-black/15 px-4 py-2 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            새로 수집
          </a>
          <Link
            href={ROUTES.input}
            className="rounded border border-black/15 px-4 py-2 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            직접 입력
          </Link>
          <Link
            href={ROUTES.report}
            className="rounded bg-foreground px-4 py-2 text-background hover:opacity-90"
          >
            보고서 초안 만들기
          </Link>
        </nav>
      </div>

      <p className="rounded border border-dashed border-black/20 px-3 py-2 text-sm text-black/70 dark:border-white/25 dark:text-white/70">
        저장된 값이나 자동 수집한 값이 없는 지표는 실습용 가상 값으로 표시하고, 방식 칸에 &quot;가상 값&quot;이라고 적습니다. 가중합 지표(점)는
        구성값마다 5년 평균·표준편차로 표준화해 더한 점수입니다.
      </p>

      <Suspense fallback={<p className="text-sm">지표를 불러오는 중…</p>}>
        <DashboardContent />
      </Suspense>
    </section>
  );
}
