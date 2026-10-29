import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { INDICATORS, RISK_LEVELS, RISK_LEVEL_LABELS, type IndicatorDefinition, type RiskLevel } from "@/lib/indicators";
import { todayInKorea } from "@/lib/dates";
import { loadDashboardData } from "@/lib/dashboard-data";
import { buildComparison, COMPARE_YEARS, type ComparePoint, type Comparison } from "@/lib/compare";
import { formatChange, formatValue } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import { CARD, NOTICE_INFO, NOTICE_WARN, TAG, TD, TH } from "@/lib/ui";
import { STATUS_STYLES, StatusBadge } from "../status-badge";
import { IndicatorSelect, type IndicatorOption } from "./indicator-select";

export const metadata: Metadata = { title: "지표 비교" };

// 지표 비교 화면 (DESIGN.md §3.4, PLAN 작업 21). 주소 ?id=지표 번호로 고른 지표의 최근 3년 값을 보여 준다
// 값은 지표 현황과 같은 곳에서 가져온다 (저장소 + 새로 수집 + 값이 없으면 가상 값)

// 그래프 색 (Tailwind 색 이름과 맞춘다)
const LEVEL_STROKE: Record<RiskLevel, string> = {
  crisis: "stroke-red-500",
  warning: "stroke-orange-500",
  caution: "stroke-amber-400",
};
const STATUS_FILL = {
  crisis: "fill-red-500",
  warning: "fill-orange-500",
  caution: "fill-amber-400",
  normal: "fill-emerald-500",
} as const;

const W = 760;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 32, left: 56 };

function niceRange(values: number[]): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  return [min - span * 0.1, max + span * 0.1];
}

// 값이 없는 기간에서 끊어 여러 선으로 나눈다
function segments(points: { x: number; y: number | null }[]): string[] {
  const result: string[] = [];
  let current: string[] = [];
  for (const p of points) {
    if (p.y === null) {
      if (current.length) result.push(current.join(" "));
      current = [];
    } else current.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }
  if (current.length) result.push(current.join(" "));
  return result;
}

function Chart({ indicator, points }: { indicator: IndicatorDefinition; points: ComparePoint[] }) {
  const levels = RISK_LEVELS.filter((level) => points.some((p) => p.thresholds[level] !== undefined));
  const all = points.flatMap((p) => [
    ...(p.value === null ? [] : [p.value]),
    ...levels.flatMap((l) => (p.thresholds[l] === undefined ? [] : [p.thresholds[l]!])),
  ]);
  if (all.length === 0) return <p className="py-16 text-center text-sm text-muted">최근 3년 동안 값이 없어요.</p>;

  const [lo, hi] = niceRange(all);
  const x = (i: number) => PAD.left + (i / Math.max(points.length - 1, 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  // 해가 바뀌는 곳에 연도를 적는다. 첫 기간은 다음 해 시작과 겹치지 않을 만큼 떨어져 있을 때만 적는다
  const firstYearStart = points.findIndex((p) => /-(01|Q1)$/.test(p.period));
  const yearStarts = points.flatMap((p, i) =>
    /-(01|Q1)$/.test(p.period) || (i === 0 && firstYearStart > points.length / 6) ? [{ i, year: p.period.slice(0, 4) }] : [],
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${indicator.name} 최근 ${COMPARE_YEARS}년 그래프`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">
            {formatValue(Number(t.toPrecision(3)), "")}
          </text>
        </g>
      ))}
      {yearStarts.map(({ i, year }) => (
        <g key={year}>
          <line x1={x(i)} x2={x(i)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-line" strokeDasharray="2 4" />
          <text x={x(i) + 4} y={H - 10} className="fill-muted text-[11px]">
            {year}년
          </text>
        </g>
      ))}
      {levels.map((level) =>
        segments(points.map((p, i) => ({ x: x(i), y: p.thresholds[level] === undefined ? null : y(p.thresholds[level]!) }))).map(
          (d, k) => (
            <polyline key={`${level}-${k}`} points={d} fill="none" className={LEVEL_STROKE[level]} strokeWidth={1.5} strokeDasharray="5 4" />
          ),
        ),
      )}
      {segments(points.map((p, i) => ({ x: x(i), y: p.value === null ? null : y(p.value) }))).map((d, k) => (
        <polyline key={k} points={d} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" />
      ))}
      {points.map((p, i) =>
        p.value === null ? null : (
          <circle key={p.period} cx={x(i)} cy={y(p.value)} r={3.5} className={p.status ? STATUS_FILL[p.status] : "fill-slate-400"}>
            <title>
              {`${periodLabel(p.period)}: ${formatValue(p.value, indicator.unit)}${p.status ? ` · ${STATUS_STYLES[p.status].label}` : " · 판정 안 함"}`}
            </title>
          </circle>
        ),
      )}
    </svg>
  );
}

function Legend({ points }: { points: ComparePoint[] }) {
  const levels = RISK_LEVELS.filter((level) => points.some((p) => p.thresholds[level] !== undefined));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-5 bg-accent" aria-hidden /> 값
      </span>
      {levels.map((level) => (
        <span key={level} className="inline-flex items-center gap-1.5">
          <svg width="20" height="4" aria-hidden>
            <line x1="0" x2="20" y1="2" y2="2" className={LEVEL_STROKE[level]} strokeWidth={2} strokeDasharray="5 3" />
          </svg>
          {RISK_LEVEL_LABELS[level]} 임계점
        </span>
      ))}
      <span>점 색: 그 기간의 단계 (회색은 판정 안 함)</span>
    </div>
  );
}

function YearTable({ indicator, comparison }: { indicator: IndicatorDefinition; comparison: Comparison }) {
  const { years, rows } = comparison;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-muted text-left">
          <tr>
            <th className={TH}>{indicator.publicationCycle === "quarterly" ? "분기" : "월"}</th>
            {years.map((year) => (
              <th key={year} className={`${TH} text-right`}>
                {year}년
              </th>
            ))}
            <th className={`${TH} text-right`}>전년 대비</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-line">
              <td className={`${TD} font-medium`}>{row.label}</td>
              {row.points.map((p, i) => (
                <td key={years[i]} className={`${TD} text-right tabular-nums`}>
                  {p?.value == null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {formatValue(p.value, indicator.unit)}
                      <span
                        className={`h-2 w-2 rounded-full ${p.status ? STATUS_STYLES[p.status].dot : "bg-slate-300 dark:bg-slate-600"}`}
                        title={p.status ? STATUS_STYLES[p.status].label : "판정 안 함"}
                        aria-label={p.status ? STATUS_STYLES[p.status].label : "판정 안 함"}
                      />
                    </span>
                  )}
                </td>
              ))}
              <td className={`${TD} text-right tabular-nums`}>
                {row.change ? formatChange(row.change) : <span className="text-muted">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function CompareContent({ searchParams }: { searchParams: PageProps<"/compare">["searchParams"] }) {
  const { id } = await searchParams;
  await connection();
  const indicator = INDICATORS.find((i) => i.id === id) ?? INDICATORS[0];
  const today = todayInKorea();
  const { series, sampleIds, failedIds, notices } = await loadDashboardData(today);

  const options: IndicatorOption[] = INDICATORS.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    note: sampleIds.has(i.id) ? "가상 값" : undefined,
  }));
  const comparison = buildComparison(indicator, series, today);
  const latest = comparison.points.findLast((p) => p.value !== null);

  return (
    <div className="flex flex-col gap-4">
      {notices.map((notice) => (
        <p key={notice} className={NOTICE_WARN}>
          {notice}
        </p>
      ))}

      <IndicatorSelect options={options} value={indicator.id} />

      <div className={`${CARD} flex flex-col gap-4 p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              {indicator.name}
              {sampleIds.has(indicator.id) && (
                <span className={`${TAG} bg-slate-50 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300`}>가상 값</span>
              )}
              {failedIds.has(indicator.id) && (
                <span className={`${TAG} bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300`}>
                  이번 수집 실패 · 저장된 값
                </span>
              )}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {indicator.source.name} · {indicator.collectionMethod === "auto" ? "자동 수집" : "직접 입력"}
              {indicator.publicationCycle === "daily" && " · 일별 값을 월 평균으로 묶음"}
            </p>
          </div>
          {latest && (
            <div className="text-right">
              <p className="text-xs text-muted">최근 값 ({periodLabel(latest.period)})</p>
              <p className="mt-0.5 flex items-center justify-end gap-2 text-lg font-semibold tabular-nums">
                {formatValue(latest.value!, indicator.unit)}
                {latest.status && <StatusBadge status={latest.status} />}
              </p>
            </div>
          )}
        </div>
        <Chart indicator={indicator} points={comparison.points} />
        <Legend points={comparison.points} />
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="border-b border-line px-5 py-3">
          <h3 className="text-sm font-semibold">같은 {indicator.publicationCycle === "quarterly" ? "분기" : "달"} 연도별 비교</h3>
        </div>
        <YearTable indicator={indicator} comparison={comparison} />
      </div>

      {indicator.components && (
        <p className={NOTICE_INFO}>
          가중합 점수는 기간마다 그 앞 5년 값으로 표준화한 점수라, 해마다 기준이 조금씩 달라요. 흐름을 보는 용도로 써 주세요.
        </p>
      )}
    </div>
  );
}

export default function ComparePage({ searchParams }: PageProps<"/compare">) {
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">지표 비교</h1>
        <p className="mt-1 text-sm text-muted">
          최근 {COMPARE_YEARS}년 값을 그래프와 연도별 표로 비교합니다. 단계는 기간마다 그때의 임계점으로 판정했습니다.
        </p>
      </div>
      <Suspense fallback={<div className={`${CARD} h-96 animate-pulse bg-surface-muted`} aria-label="지표 값을 불러오는 중" />}>
        <CompareContent searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
