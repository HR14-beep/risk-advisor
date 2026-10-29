// 위험 신호 원인 분석 실행과 저장 (DESIGN.md §4.4, PLAN 작업 22)
// 같은 지표·같은 기준 기간·같은 단계의 분석은 저장해 두고 다시 쓴다 (AI를 다시 부르지 않는다).
// 비용이 끝없이 늘지 않도록 하루에 새로 분석하는 횟수를 제한한다.
import "server-only";
import { INDICATORS } from "@/lib/indicators";
import { buildDashboard, type DisplayStatus } from "@/lib/dashboard";
import { loadDashboardData } from "@/lib/dashboard-data";
import { generateText, type Citation } from "@/lib/openai";
import { getSupabase } from "@/lib/supabase";
import { StoreError } from "@/lib/value-store";
import {
  buildExplainInput,
  EXPLAIN_JSON_SCHEMA,
  EXPLAINABLE,
  explainInstructions,
  parseExplanation,
  type ExplanationBody,
} from "@/lib/explain-prompt";
import type { PeriodKey } from "@/lib/period";

const TABLE = "indicator_explanations";
// 빠른 모델을 따로 쓴다. 보고서용 OPENAI_MODEL(생각하는 모델)은 몇 분 걸려 버튼에 맞지 않는다
const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_DAILY_LIMIT = 20;
const TIMEOUT_MS = 90_000;
const MAX_OUTPUT_TOKENS = 2_000;

export type Explanation = ExplanationBody & {
  indicatorId: string;
  period: PeriodKey;
  status: DisplayStatus;
  sources: Citation[];
  usedWebSearch: boolean;
  isSample: boolean;
  createdAt: string;
};

// not-found: 없는 지표 / not-risky: 지금 위험 단계가 아님 / limit: 오늘 분석 횟수를 다 씀 / invalid: AI 답 모양이 틀림
export class ExplainError extends Error {
  constructor(
    readonly kind: "not-found" | "not-risky" | "limit" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "ExplainError";
  }
}

type Row = {
  indicator_id: string;
  period: string;
  status: DisplayStatus;
  summary: string;
  factors: ExplanationBody["factors"];
  check_point: string;
  sources: Citation[];
  used_web_search: boolean;
  is_sample: boolean;
  created_at: string;
};

function toExplanation(row: Row): Explanation {
  return {
    indicatorId: row.indicator_id,
    period: row.period,
    status: row.status,
    summary: row.summary,
    factors: row.factors,
    check: row.check_point,
    sources: row.sources,
    usedWebSearch: row.used_web_search,
    isSample: row.is_sample,
    createdAt: row.created_at,
  };
}

export function dailyLimit(): number {
  const n = Number(process.env.EXPLAIN_DAILY_LIMIT);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_DAILY_LIMIT;
}

async function saved(indicatorId: string, period: PeriodKey, status: DisplayStatus): Promise<Explanation | null> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("indicator_id", indicatorId)
    .eq("period", period)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new StoreError("저장된 원인 분석을 불러오", error);
  return data[0] ? toExplanation(data[0] as Row) : null;
}

// 한국 시간 오늘 새로 만든 분석 수
async function countToday(today: string): Promise<number> {
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .gte("created_at", `${today}T00:00:00+09:00`);
  if (error || count === null) throw new StoreError("오늘 분석 횟수를 확인", error ?? { message: "결과 없음" });
  return count;
}

async function currentRow(indicatorId: string, today: string) {
  if (!INDICATORS.some((i) => i.id === indicatorId)) throw new ExplainError("not-found", "없는 지표예요.");
  const { series, sampleIds, failedIds } = await loadDashboardData(today);
  const { sections } = buildDashboard(INDICATORS, series, today, failedIds);
  const rows = sections.flatMap((s) => s.rows).map((r) => ({ ...r, isSample: sampleIds.has(r.indicator.id) }));
  const row = rows.find((r) => r.indicator.id === indicatorId)!;
  if (!EXPLAINABLE.includes(row.status)) {
    throw new ExplainError("not-risky", "지금 위기·경계·주의 단계인 지표만 원인을 분석해요.");
  }
  return { row, rows, series };
}

// 저장된 분석만 찾는다 (AI를 부르지 않는다)
export async function findExplanation(indicatorId: string, today: string): Promise<Explanation | null> {
  const { row } = await currentRow(indicatorId, today);
  return saved(indicatorId, row.period, row.status);
}

// force가 아니면 저장된 분석을 먼저 쓴다
export async function explainIndicator(indicatorId: string, today: string, force = false): Promise<Explanation> {
  const { row, rows, series } = await currentRow(indicatorId, today);
  if (!force) {
    const existing = await saved(indicatorId, row.period, row.status);
    if (existing) return existing;
  }

  const limit = dailyLimit();
  if ((await countToday(today)) >= limit) {
    throw new ExplainError("limit", `오늘 원인 분석을 ${limit}번 모두 썼어요. 내일 다시 시도하거나 저장된 분석을 봐 주세요.`);
  }

  // 사내 데이터(직접 입력) 지표는 웹 검색을 쓰지 않는다 (PRD 7번)
  const webSearch = row.indicator.collectionMethod === "auto";
  const { text, citations, model } = await generateText({
    instructions: explainInstructions(webSearch),
    input: buildExplainInput(row, rows, series),
    model: process.env.OPENAI_EXPLAIN_MODEL || DEFAULT_MODEL,
    timeoutMs: TIMEOUT_MS,
    webSearch,
    reasoningEffort: "low",
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    jsonSchema: { name: "indicator_explanation", schema: EXPLAIN_JSON_SCHEMA },
  });
  const body = parseExplanation(text, webSearch);
  if (!body) throw new ExplainError("invalid", "AI 답을 읽지 못했어요. 다시 분석해 주세요.");

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert({
      indicator_id: indicatorId,
      period: row.period,
      status: row.status,
      summary: body.summary,
      factors: body.factors,
      check_point: body.check,
      sources: webSearch ? citations.slice(0, 5) : [],
      used_web_search: webSearch,
      is_sample: row.isSample,
      model,
    })
    .select()
    .single();
  if (error) throw new StoreError("원인 분석을 저장", error);
  return toExplanation(data as Row);
}
