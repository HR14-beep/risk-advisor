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
  type DashboardSection,
  type DisplayStatus,
} from "@/lib/dashboard";
import type { JudgeResult } from "@/lib/judge";
import { NO_DATA_REASONS, formatChange, formatDay, formatValue } from "@/lib/format";
import { periodLabel, referencePeriod } from "@/lib/period";
import { ROUTES } from "@/lib/site";
import { STATUS_STYLES, StatusBadge } from "./status-badge";
import { ExplainButton } from "./explain-button";
import { EXPLAINABLE } from "@/lib/explain-prompt";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, NOTICE_INFO, NOTICE_WARN, TAG, TD, TH } from "@/lib/ui";

// 지표 현황 화면 (DESIGN.md §3.1, PLAN 작업 6~7)
// 자동 수집·저장소 값을 쓰고, 값이 없는 지표는 lib/sample-values.ts의 가상 값으로 보여 준다 (lib/dashboard-data.ts)

const EXCEEDED: DisplayStatus[] = ["crisis", "warning", "caution"];

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
  return <div className="mt-0.5 text-xs text-muted">{parts.join(" · ")}</div>;
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
            className="text-accent underline-offset-2 hover:underline"
          >
            {source.name}
          </a>
        ) : (
          <span key={source.name} className="text-muted">
            {source.name}
          </span>
        ),
      )}
    </div>
  );
}

// 예: "KOSPI 20%(하락 시 위험)" — 지표 방향과 반대로 움직이는 구성값을 표시한다
function componentLabel(c: NonNullable<IndicatorDefinition["components"]>[number]): string {
  return `${c.name} ${Math.round(c.weight * 100)}%${c.sign === -1 ? "(하락 시 위험)" : ""}`;
}

function IndicatorName({ indicator }: { indicator: IndicatorDefinition }) {
  return (
    <>
      <div className="font-medium">{indicator.name}</div>
      {indicator.components && (
        <div className="mt-0.5 text-xs leading-relaxed text-muted">
          {indicator.components.map(componentLabel).join(" · ")}
        </div>
      )}
    </>
  );
}

function IndicatorRow({ row, isSample }: { row: DashboardRow; isSample: boolean }) {
  const { indicator, period, result, status, noDataReason, deadline, needsUpdate, previous, change, collectionFailure } =
    row;
  const dash = <span className="text-muted/60">—</span>;

  return (
    <tr className={`border-t border-line align-top transition-colors hover:bg-surface-muted/60 ${STATUS_STYLES[status].bar}`}>
      <td className={TD}>
        <IndicatorName indicator={indicator} />
      </td>
      <td className={`${TD} text-right`}>
        {result ? (
          <>
            <div className="font-semibold">{formatValue(result.value, indicator.unit)}</div>
            <ThresholdNote indicator={indicator} result={result} />
          </>
        ) : previous?.result ? (
          // 발표 전·수집 실패: 직전 값을 흐리게 보여 준다 (판정에는 쓰지 않는다)
          <div className="text-muted">
            <div>{formatValue(previous.result.value, indicator.unit)}</div>
            <div className="mt-0.5 text-xs">{periodLabel(previous.period)} 값</div>
          </div>
        ) : (
          dash
        )}
      </td>
      <td className={`${TD} text-right`}>
        {change ? (
          <span className={change.change > 0 ? "text-rose-600 dark:text-rose-400" : change.change < 0 ? "text-blue-600 dark:text-blue-400" : ""}>
            {formatChange(change)}
          </span>
        ) : (
          dash
        )}
      </td>
      <td className={TD}>
        <div className="flex flex-col items-start gap-1.5">
          <StatusBadge status={status} />
          {EXPLAINABLE.includes(status) && <ExplainButton indicatorId={indicator.id} indicatorName={indicator.name} />}
          {noDataReason && <span className="text-xs text-muted">{NO_DATA_REASONS[noDataReason]}</span>}
          {status === "notYetPublished" && deadline && (
            <span className="text-xs text-muted">
              {indicator.collectionMethod === "manual"
                ? `${formatDay(deadline)}까지 입력`
                : `${indicator.publishTiming} 발표 (${formatDay(deadline)}까지)`}
            </span>
          )}
          {status === "notYetPublished" && previous?.result && (
            <span className="text-xs text-muted">직전 판정: {STATUS_STYLES[previous.result.status].label}</span>
          )}
          {collectionFailure && (
            <span className="text-xs text-muted">수집 실패, 직전 값 기준일 {collectionFailure.lastDate ?? "없음"}</span>
          )}
          {needsUpdate && (
            <span className={`${TAG} bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300`}>
              갱신 필요
            </span>
          )}
        </div>
      </td>
      <td className={`${TD} whitespace-nowrap text-muted`}>{periodLabel(period)}</td>
      <td className={TD}>
        <SourceLinks indicator={indicator} />
      </td>
      <td className={`${TD} whitespace-nowrap`}>
        <div>{indicator.collectionMethod === "auto" ? "자동" : "직접 입력"}</div>
        {isSample && (
          <span className={`${TAG} mt-1 bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300`}>
            가상 값
          </span>
        )}
      </td>
    </tr>
  );
}

// 분류 머리줄: 이름·지표 수와, 임계점을 넘은 지표 개수
function SectionSummary({ section }: { section: DashboardSection }) {
  const exceeded = EXCEEDED.flatMap((status) => {
    const count = section.rows.filter((r) => r.status === status).length;
    return count > 0 ? [{ status, count }] : [];
  });
  return (
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
      <span className="flex items-center gap-2">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-muted transition-transform group-open:rotate-90" aria-hidden>
          <path d="M7.5 4.5l6 5.5-6 5.5z" />
        </svg>
        <span className="text-base font-semibold">{section.label}</span>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">{section.rows.length}</span>
      </span>
      <span className="flex flex-wrap justify-end gap-1.5">
        {exceeded.length === 0 ? (
          <span className="text-xs text-muted">임계점을 넘은 지표 없음</span>
        ) : (
          exceeded.map(({ status, count }) => (
            <span key={status} className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[status].pill}`}>
              {STATUS_STYLES[status].label} {count}
            </span>
          ))
        )}
      </span>
    </summary>
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
      <p className="text-sm text-muted">
        점검 기준 <span className="font-medium text-foreground">{periodLabel(referencePeriod("monthly", today))}분</span>
        {" "}(분기 지표 {periodLabel(referencePeriod("quarterly", today))}분) · 마지막 수집 {formatKoreaTime(now)}
      </p>

      {notices.length > 0 && (
        <ul className={`${NOTICE_WARN} flex flex-col gap-1`}>
          {notices.map((notice) => (
            <li key={notice}>⚠ {notice}</li>
          ))}
        </ul>
      )}

      {/* ② 요약 카드 */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {DISPLAY_STATUSES.map((status) => (
          <li key={status} className={`${CARD} px-4 py-3.5`}>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <span className={`h-2 w-2 rounded-full ${STATUS_STYLES[status].dot}`} aria-hidden />
              {STATUS_STYLES[status].label}
            </div>
            <div className={`tabular mt-1 text-3xl font-semibold tracking-tight ${counts[status] === 0 ? "text-muted/50" : ""}`}>
              {counts[status]}
            </div>
          </li>
        ))}
      </ul>

      {/* ③ 분류별 표 */}
      {sections.map((section) => (
        <details key={section.category} open className={`${CARD} group overflow-hidden`}>
          <SectionSummary section={section} />
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[880px] table-fixed text-sm">
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
              <thead className="whitespace-nowrap bg-surface-muted text-left">
                <tr>
                  <th className={TH}>지표명</th>
                  <th className={`${TH} text-right`}>현재 값</th>
                  <th className={`${TH} text-right`}>직전 대비</th>
                  <th className={TH}>단계</th>
                  <th className={TH}>기준 기간</th>
                  <th className={TH}>확인 위치</th>
                  <th className={TH}>방식</th>
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

// 불러오는 동안 보여 줄 자리 표시
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-label="지표를 불러오는 중">
      <p className="text-sm text-muted">지표를 수집하고 판정하는 중이에요…</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {DISPLAY_STATUSES.map((status) => (
          <div key={status} className={`${CARD} h-[78px] animate-pulse bg-surface-muted`} />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className={`${CARD} h-40 animate-pulse bg-surface-muted`} />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <section className="flex flex-col gap-6">
      {/* ① 상단 바 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">지표 현황</h1>
          <p className="mt-1 text-sm text-muted">외부 경제지표 22개를 수집해 분류별 임계점으로 판정합니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* 화면을 다시 열면 수집·판정을 새로 한다 */}
          <a href={ROUTES.dashboard} className={BUTTON_SECONDARY}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
              <path d="M16 10a6 6 0 1 1-1.76-4.24M16 4v3.5h-3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            새로 수집
          </a>
          <Link href={ROUTES.report} className={BUTTON_PRIMARY}>
            보고서 초안 만들기
          </Link>
        </div>
      </div>

      <p className={NOTICE_INFO}>
        저장된 값이나 자동 수집한 값이 없는 지표는 실습용 가상 값으로 보여 주고 &quot;가상 값&quot;으로 표시합니다. 가중합
        지표(점)는 구성값마다 5년 평균·표준편차로 표준화해 더한 점수입니다.
      </p>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </section>
  );
}
