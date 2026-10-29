// 지표 업데이트 메일 알림 실행 (DESIGN.md §7-1, PLAN 작업 20)
// 지표 수집·판정 → 지난 알림과 비교 → 새 값이 있으면 메일 발송 → 기록 저장
import "server-only";
import { INDICATORS } from "@/lib/indicators";
import { buildDashboard } from "@/lib/dashboard";
import { loadDashboardData } from "@/lib/dashboard-data";
import { buildDigest, renderDigestEmail, type DigestItem, type Snapshot } from "@/lib/notify-digest";
import { mailConfig, sendMail } from "@/lib/mailer";
import { getSupabase } from "@/lib/supabase";
import { StoreError } from "@/lib/value-store";
import { SITE_URL } from "@/lib/site";

const RUNS_TABLE = "notification_runs";

async function lastSnapshot(): Promise<Snapshot | null> {
  const { data, error } = await getSupabase()
    .from(RUNS_TABLE)
    .select("snapshot")
    .order("ran_at", { ascending: false })
    .limit(1);
  if (error) throw new StoreError("지난 알림 기록을 불러오", error);
  return (data[0]?.snapshot as Snapshot | undefined) ?? null;
}

async function saveRun(run: { snapshot: Snapshot; itemCount: number; sentTo: string | null }): Promise<void> {
  const { error } = await getSupabase().from(RUNS_TABLE).insert({
    snapshot: run.snapshot,
    item_count: run.itemCount,
    sent_to: run.sentTo,
    sent: run.sentTo !== null,
  });
  if (error) throw new StoreError("알림 기록을 저장", error);
}

// "10월 30일(금)"
function dateLabel(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const weekday = "일월화수목금토"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일(${weekday})`;
}

export type NotifyResult = {
  items: DigestItem[];
  sent: boolean;
  sentTo: string | null;
  subject: string | null;
  notices: string[];
};

// preview: 메일을 보내지 않고 기록도 남기지 않는다 (내용 확인용)
export async function runNotification(today: string, { preview = false } = {}): Promise<NotifyResult> {
  // 메일 설정이 없으면 수집 전에 멈춘다 (미리 보기는 설정 없이도 된다)
  if (!preview) mailConfig();

  const { series, sampleIds, failedIds, notices } = await loadDashboardData(today);
  const { sections } = buildDashboard(INDICATORS, series, today, failedIds);
  const rows = sections.flatMap((s) => s.rows.map((row) => ({ ...row, isSample: sampleIds.has(row.indicator.id) })));

  const { items, snapshot } = buildDigest(rows, await lastSnapshot());
  const mail = items.length > 0 ? renderDigestEmail(items, dateLabel(today), SITE_URL) : null;

  if (preview) return { items, sent: false, sentTo: null, subject: mail?.subject ?? null, notices };

  // 새로 발표된 값이 없으면 보내지 않고, 비교 기준만 새로 남긴다
  const sentTo = mail ? (await sendMail(mail)).to : null;
  await saveRun({ snapshot, itemCount: items.length, sentTo });
  return { items, sent: sentTo !== null, sentTo, subject: mail?.subject ?? null, notices };
}
