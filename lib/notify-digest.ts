// 지표 업데이트 메일 알림: 새로 발표된 값 골라내기와 메일 내용 (DESIGN.md §7-1, PLAN 작업 20)
import type { DashboardRow, DisplayStatus } from "@/lib/dashboard";
import type { JudgeResult } from "@/lib/judge";
import { DISPLAY_STATUS_LABELS, formatChange, formatValue } from "@/lib/format";
import { periodLabel, type PeriodKey } from "@/lib/period";

// 지표별로 값이 있는 가장 최근 기간과 그 단계 (다음 알림 때 비교한다)
export type Snapshot = Record<string, { period: PeriodKey; status: DisplayStatus }>;

export type DigestRow = DashboardRow & { isSample: boolean };

export type DigestItem = {
  id: string;
  name: string;
  period: PeriodKey;
  value: string;
  status: DisplayStatus;
  change: string | null;
  previousStatus: DisplayStatus | null; // 단계가 바뀌었을 때 이전 단계
  source: string;
};

const SEVERITY: Partial<Record<DisplayStatus, number>> = { crisis: 0, warning: 1, caution: 2, normal: 3 };

// 값이 있는 가장 최근 기간: 기준 기간 값이 있으면 그것, 발표 전이면 직전 발표 값
function latestPublished(row: DashboardRow): { period: PeriodKey; result: JudgeResult } | null {
  if (row.result) return { period: row.period, result: row.result };
  if (row.previous?.result) return { period: row.previous.period, result: row.previous.result };
  return null;
}

// 공개 통계로 자동 수집한 실제 값만 알린다 (사내 데이터·가상 값·수집 실패는 뺀다)
function eligible(row: DigestRow): boolean {
  return row.indicator.collectionMethod === "auto" && !row.isSample && row.status !== "collectionFailed";
}

// previous가 없으면(첫 알림) 지금 값이 있는 지표를 모두 새 값으로 본다
export function buildDigest(rows: DigestRow[], previous: Snapshot | null): { items: DigestItem[]; snapshot: Snapshot } {
  const snapshot: Snapshot = {};
  const items: DigestItem[] = [];

  for (const row of rows) {
    if (!eligible(row)) continue;
    const latest = latestPublished(row);
    if (!latest) continue;
    const { indicator } = row;
    snapshot[indicator.id] = { period: latest.period, status: latest.result.status };

    const before = previous?.[indicator.id];
    const isNew = !before || before.period !== latest.period;
    const statusChanged = Boolean(before) && before!.status !== latest.result.status;
    if (!isNew && !statusChanged) continue;

    items.push({
      id: indicator.id,
      name: indicator.name,
      period: latest.period,
      value: formatValue(latest.result.value, indicator.unit),
      status: latest.result.status,
      change: latest.period === row.period && row.change ? formatChange(row.change) : null,
      previousStatus: statusChanged ? before!.status : null,
      source: indicator.source.name,
    });
  }

  // 단계가 바뀐 지표 → 위험한 단계 순서
  items.sort(
    (a, b) =>
      Number(b.previousStatus !== null) - Number(a.previousStatus !== null) ||
      (SEVERITY[a.status] ?? 9) - (SEVERITY[b.status] ?? 9),
  );
  return { items, snapshot };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const STATUS_COLORS: Record<DisplayStatus, string> = {
  crisis: "#dc2626",
  warning: "#ea580c",
  caution: "#d97706",
  normal: "#059669",
  notYetPublished: "#0284c7",
  collectionFailed: "#7c3aed",
  noData: "#64748b",
};

function statusText(item: DigestItem): string {
  const now = DISPLAY_STATUS_LABELS[item.status];
  return item.previousStatus ? `${DISPLAY_STATUS_LABELS[item.previousStatus]} → ${now}` : now;
}

// dateLabel 예: "10월 30일(금)"
export function renderDigestEmail(
  items: DigestItem[],
  dateLabel: string,
  siteUrl: string,
): { subject: string; html: string; text: string } {
  const changed = items.filter((i) => i.previousStatus !== null).length;
  const subject = `[위기관리 신호등] ${dateLabel} 지표 업데이트 ${items.length}건${changed > 0 ? ` (단계 변경 ${changed}건)` : ""}`;

  const text = [
    `${dateLabel} 기준, 지난 알림 이후 새로 발표되거나 단계가 바뀐 지표 ${items.length}건입니다.`,
    "",
    ...items.map(
      (i) =>
        `- ${i.name} (${periodLabel(i.period)}): ${i.value} · ${statusText(i)}${i.change ? ` · 직전 대비 ${i.change}` : ""} · ${i.source}`,
    ),
    "",
    `지표 현황 보기: ${siteUrl}`,
    "이 메일은 위기관리 신호등이 매주 월·금 오전 9시에 자동으로 보냅니다. 공개 통계만 담고 사내 데이터는 담지 않습니다.",
  ].join("\n");

  const rowsHtml = items
    .map(
      (i) => `<tr>
  <td style="padding:10px 12px;border-top:1px solid #e2e8f0">${escapeHtml(i.name)}<div style="color:#64748b;font-size:12px">${escapeHtml(i.source)}</div></td>
  <td style="padding:10px 12px;border-top:1px solid #e2e8f0;white-space:nowrap">${escapeHtml(periodLabel(i.period))}</td>
  <td style="padding:10px 12px;border-top:1px solid #e2e8f0;text-align:right;white-space:nowrap"><b>${escapeHtml(i.value)}</b>${i.change ? `<div style="color:#64748b;font-size:12px">직전 대비 ${escapeHtml(i.change)}</div>` : ""}</td>
  <td style="padding:10px 12px;border-top:1px solid #e2e8f0;white-space:nowrap;color:${STATUS_COLORS[i.status]};font-weight:700">${escapeHtml(statusText(i))}</td>
</tr>`,
    )
    .join("\n");

  const html = `<div style="font-family:'Malgun Gothic',sans-serif;color:#0f172a;max-width:680px">
  <h2 style="margin:0 0 4px;font-size:18px">위기관리 신호등 · ${escapeHtml(dateLabel)} 지표 업데이트</h2>
  <p style="margin:0 0 16px;color:#475569;font-size:14px">지난 알림 이후 새로 발표되거나 단계가 바뀐 지표 <b>${items.length}건</b>입니다.${changed > 0 ? ` 단계가 바뀐 지표 ${changed}건을 맨 위에 두었습니다.` : ""}</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px;border:1px solid #e2e8f0">
    <thead><tr style="background:#f1f5f9;text-align:left;color:#475569;font-size:12px">
      <th style="padding:8px 12px">지표</th><th style="padding:8px 12px">기준 기간</th><th style="padding:8px 12px;text-align:right">값</th><th style="padding:8px 12px">단계</th>
    </tr></thead>
    <tbody>
${rowsHtml}
    </tbody>
  </table>
  <p style="margin:16px 0"><a href="${escapeHtml(siteUrl)}" style="background:#1d4ed8;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px">지표 현황 보기</a></p>
  <p style="color:#94a3b8;font-size:12px">이 메일은 위기관리 신호등이 매주 월·금 오전 9시에 자동으로 보냅니다. 공개 통계만 담고 사내 데이터는 담지 않습니다.</p>
</div>`;

  return { subject, html, text };
}
