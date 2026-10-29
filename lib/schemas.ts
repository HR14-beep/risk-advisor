// 직접 입력값 검사 규칙 (DESIGN.md §3.2, §4.2, PLAN 작업 9)
// 화면(바로 경고)과 서버 API(저장 전 한 번 더) 양쪽에서 같은 규칙을 쓴다.
import { z } from "zod";
import { INDICATORS, type IndicatorDefinition } from "@/lib/indicators";
import { referencePeriod } from "@/lib/period";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const entrySchema = z.object({
  indicatorId: z.string(),
  period: z.string().regex(PERIOD_PATTERN, "기간은 2026-08처럼 적어 주세요"),
  value: z.number({ error: "숫자를 입력해 주세요" }).finite("숫자를 입력해 주세요"),
  reference: z.number({ error: "숫자를 입력해 주세요" }).finite("숫자를 입력해 주세요").optional(),
});

export const manualValuesSchema = z.object({
  // 채권회수율(무담보) 과거 5년(60개월) 값을 한 번에 넣을 수 있도록 넉넉히 받는다
  entries: z.array(entrySchema).min(1, "저장할 값이 없습니다").max(200, "한 번에 200개까지 저장할 수 있습니다"),
});

export type ManualEntry = z.infer<typeof entrySchema>;

export type FieldError = {
  index: number; // entries 안의 순서 (전체에 대한 오류는 -1)
  field: "indicatorId" | "period" | "value" | "reference" | "entries";
  message: string;
};

export type ParseResult = { ok: true; entries: ManualEntry[] } | { ok: false; errors: FieldError[] };

const MANUAL_INDICATORS = new Map(
  INDICATORS.filter((i) => i.collectionMethod === "manual").map((i) => [i.id, i]),
);

export function manualIndicator(id: string): IndicatorDefinition | undefined {
  return MANUAL_INDICATORS.get(id);
}

// 지표별 규칙: 기준값이 필요한 지표는 0보다 큰 기준값, 허용 범위가 있으면 범위 안, 기준월보다 미래 기간은 안 됨
function checkEntry(entry: ManualEntry, index: number, today: string): FieldError[] {
  const indicator = manualIndicator(entry.indicatorId);
  if (!indicator) return [{ index, field: "indicatorId", message: "직접 입력 지표가 아닙니다" }];

  const errors: FieldError[] = [];
  if (entry.period > referencePeriod("monthly", today)) {
    errors.push({ index, field: "period", message: "아직 끝나지 않은 달의 값은 넣을 수 없습니다" });
  }

  const range = indicator.allowedRange;
  if (range && (entry.value < range.min || entry.value > range.max)) {
    errors.push({ index, field: "value", message: `허용 범위(${range.min}~${range.max})를 벗어났어요` });
  }

  if (indicator.threshold.kind === "reference") {
    const name = indicator.threshold.referenceName;
    if (entry.reference === undefined) {
      errors.push({ index, field: "reference", message: `${name}을(를) 입력해 주세요` });
    } else if (entry.reference <= 0) {
      errors.push({ index, field: "reference", message: `${name}은(는) 0보다 커야 합니다` });
    }
  } else if (entry.reference !== undefined) {
    errors.push({ index, field: "reference", message: "이 지표는 기준값을 쓰지 않습니다" });
  }
  return errors;
}

export function parseManualValues(input: unknown, today: string): ParseResult {
  const parsed = manualValuesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const [first, index, field] = issue.path;
        return first === "entries" && typeof index === "number" && typeof field === "string"
          ? { index, field: field as FieldError["field"], message: issue.message }
          : { index: -1, field: "entries", message: issue.message };
      }),
    };
  }

  const entries = parsed.data.entries;
  const errors = entries.flatMap((entry, index) => checkEntry(entry, index, today));

  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    const key = `${entry.indicatorId}/${entry.period}`;
    if (seen.has(key)) errors.push({ index, field: "period", message: "같은 달 값이 두 번 들어 있습니다" });
    seen.add(key);
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, entries };
}

// 입력 칸의 글자를 숫자로 바꾼다. 비어 있으면 undefined, 숫자가 아니면 NaN (검사에서 걸러진다)
export function toNumber(text: string): number | undefined {
  const trimmed = text.replace(/,/g, "").trim();
  return trimmed === "" ? undefined : Number(trimmed);
}

// 엑셀에서 복사한 "2021-09<탭>41.2" 같은 여러 줄을 [기간, 값] 목록으로 바꾼다
// 기간은 2021-09, 2021.09, 2021/09, 202109 모두 받는다
export function parseHistoryText(text: string): { rows: { period: string; value: number }[]; errors: string[] } {
  const rows: { period: string; value: number }[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === "") return;
    const match = trimmed.match(/^(\d{4})[-./]?(\d{1,2})[\s,;]+(.+)$/);
    const value = match ? toNumber(match[3]) : undefined;
    if (!match || value === undefined || !Number.isFinite(value)) {
      errors.push(`${i + 1}번째 줄을 읽지 못했어요: "${trimmed}"`);
      return;
    }
    rows.push({ period: `${match[1]}-${match[2].padStart(2, "0")}`, value });
  });
  return { rows, errors };
}
