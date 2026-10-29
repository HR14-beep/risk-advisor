"use client";

// 직접 입력 양식 (DESIGN.md §3.2). 값을 넣는 즉시 검사해 경고하고, 서버 API로 저장한다
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ManualInputData, ManualIndicatorStatus } from "@/lib/manual-input";
import { parseHistoryText, parseManualValues, toNumber, type FieldError, type ManualEntry } from "@/lib/schemas";
import { periodLabel } from "@/lib/period";
import { todayInKorea } from "@/lib/dates";

type Draft = { value: string; reference: string };
type Errors = Record<string, Partial<Record<FieldError["field"], string>>>;
type Notice = { kind: "success" | "error"; text: string } | null;

function without(errors: Errors, id: string): Errors {
  const rest = { ...errors };
  delete rest[id];
  return rest;
}

const numberFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const inputClass =
  "w-28 rounded border border-black/20 bg-transparent px-2 py-1 text-right dark:border-white/25 aria-[invalid=true]:border-red-500";
const muted = "text-black/60 dark:text-white/60";

function withUnit(value: number, unit: string): string {
  if (unit === "%") return `${numberFormat.format(value)}%`;
  return unit ? `${numberFormat.format(value)} ${unit}` : numberFormat.format(value);
}

function initialDrafts(indicators: ManualIndicatorStatus[]): Record<string, Draft> {
  return Object.fromEntries(
    indicators.map((i) => [
      i.id,
      { value: i.current ? String(i.current.value) : "", reference: i.current?.reference?.toString() ?? "" },
    ]),
  );
}

async function postEntries(entries: ManualEntry[]): Promise<{ ok: true } | { ok: false; errors?: FieldError[]; message: string }> {
  try {
    const response = await fetch("/api/manual-values", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    const body = await response.json();
    if (response.ok) return { ok: true };
    return { ok: false, errors: body.errors, message: body.error ?? "입력값을 확인해 주세요." };
  } catch {
    return { ok: false, message: "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
}

export function ManualInputForm({ data }: { data: ManualInputData }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(() => initialDrafts(data.indicators));
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);

  // 비어 있지 않은 줄만 저장 대상으로 모은다
  function collect(): { ids: string[]; entries: ManualEntry[]; missing: Errors } {
    const ids: string[] = [];
    const entries: ManualEntry[] = [];
    const missing: Errors = {};
    for (const indicator of data.indicators) {
      const draft = drafts[indicator.id];
      if (draft.value.trim() === "" && draft.reference.trim() === "") continue;
      if (draft.value.trim() === "") {
        missing[indicator.id] = { value: "지표값을 입력해 주세요" };
        continue;
      }
      ids.push(indicator.id);
      entries.push({
        indicatorId: indicator.id,
        period: data.period,
        value: toNumber(draft.value) ?? Number.NaN,
        reference: indicator.referenceName ? toNumber(draft.reference) : undefined,
      });
    }
    return { ids, entries, missing };
  }

  function toErrors(ids: string[], fieldErrors: FieldError[], base: Errors = {}): Errors {
    const result: Errors = { ...base };
    for (const error of fieldErrors) {
      const id = ids[error.index];
      if (id) result[id] = { ...result[id], [error.field]: error.message };
    }
    return result;
  }

  function validate(nextDrafts: Record<string, Draft>, id: string) {
    // 바로 경고: 고친 줄만 다시 검사한다
    const draft = nextDrafts[id];
    const indicator = data.indicators.find((i) => i.id === id)!;
    if (draft.value.trim() === "" && draft.reference.trim() === "") {
      setErrors((current) => without(current, id));
      return;
    }
    const result = parseManualValues(
      {
        entries: [
          {
            indicatorId: id,
            period: data.period,
            value: toNumber(draft.value) ?? Number.NaN,
            reference: indicator.referenceName ? toNumber(draft.reference) : undefined,
          },
        ],
      },
      todayInKorea(),
    );
    setErrors((current) => {
      const rest = without(current, id);
      return result.ok ? rest : toErrors([id], result.errors, rest);
    });
  }

  function update(id: string, field: keyof Draft, text: string) {
    const next = { ...drafts, [id]: { ...drafts[id], [field]: text } };
    setDrafts(next);
    setNotice(null);
    validate(next, id);
  }

  async function save() {
    const { ids, entries, missing } = collect();
    if (entries.length === 0 && Object.keys(missing).length === 0) {
      setNotice({ kind: "error", text: "저장할 값이 없습니다." });
      return;
    }
    const result = entries.length > 0 ? parseManualValues({ entries }, todayInKorea()) : null;
    if (Object.keys(missing).length > 0 || (result && !result.ok)) {
      setErrors(result && !result.ok ? toErrors(ids, result.errors, missing) : missing);
      setNotice({ kind: "error", text: "빨간 글씨로 표시된 칸을 고친 뒤 다시 저장해 주세요." });
      return;
    }

    setSaving(true);
    const response = await postEntries(entries);
    setSaving(false);
    if (response.ok) {
      setErrors({});
      setNotice({ kind: "success", text: `${entries.length}개 지표를 저장했어요.` });
      router.refresh();
    } else {
      if (response.errors) setErrors(toErrors(ids, response.errors));
      setNotice({ kind: "error", text: response.message });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="whitespace-nowrap bg-black/5 text-left dark:bg-white/10">
            <tr>
              <th className="px-3 py-2">지표명</th>
              <th className="px-3 py-2">마지막 입력</th>
              <th className="px-3 py-2">기준값</th>
              <th className="px-3 py-2">지표값</th>
            </tr>
          </thead>
          <tbody>
            {data.indicators.map((indicator) => {
              const draft = drafts[indicator.id];
              const error = errors[indicator.id] ?? {};
              return (
                <tr key={indicator.id} className="border-t border-black/10 align-top dark:border-white/15">
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {indicator.name}
                      {indicator.needsUpdate && (
                        <span className="rounded border border-amber-500 px-1.5 text-xs text-amber-700 dark:text-amber-300">
                          갱신 필요
                        </span>
                      )}
                    </div>
                    {indicator.needsHistory && (
                      <div className={`text-xs ${muted}`}>
                        과거 5년 값 {indicator.historyCount}/{indicator.historyRequired}개월 저장됨
                      </div>
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 ${muted}`}>
                    {indicator.latest ? (
                      <>
                        <div>{periodLabel(indicator.latest.period)}</div>
                        <div className="text-xs">
                          {withUnit(indicator.latest.value, indicator.unit)}
                          {indicator.latest.reference !== undefined &&
                            ` (기준값 ${withUnit(indicator.latest.reference, indicator.unit)})`}
                        </div>
                      </>
                    ) : (
                      "아직 없음"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {indicator.referenceName ? (
                      <label className="flex flex-col gap-1">
                        <span className={`text-xs ${muted}`}>{indicator.referenceName}</span>
                        <span className="flex items-center gap-1">
                          <input
                            inputMode="decimal"
                            className={inputClass}
                            value={draft.reference}
                            aria-invalid={Boolean(error.reference)}
                            onChange={(e) => update(indicator.id, "reference", e.target.value)}
                          />
                          <span className={muted}>{indicator.unit}</span>
                        </span>
                        {error.reference && <span className="text-xs text-red-600">⚠ {error.reference}</span>}
                      </label>
                    ) : (
                      <span className={`text-xs ${muted}`}>5년 표준편차 방식 (기준값 없음)</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <label className="flex flex-col gap-1">
                      <span className="sr-only">{indicator.name} 지표값</span>
                      <span className="flex items-center gap-1">
                        <input
                          inputMode="decimal"
                          className={inputClass}
                          value={draft.value}
                          aria-invalid={Boolean(error.value)}
                          onChange={(e) => update(indicator.id, "value", e.target.value)}
                        />
                        <span className={muted}>{indicator.unit}</span>
                      </span>
                      {(error.value || error.period) && (
                        <span className="text-xs text-red-600">⚠ {error.value ?? error.period}</span>
                      )}
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {notice && (
          <p className={`text-sm ${notice.kind === "success" ? "text-green-700 dark:text-green-300" : "text-red-600"}`}>
            {notice.text}
          </p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-foreground px-5 py-2 text-background hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>

      {data.indicators
        .filter((indicator) => indicator.needsHistory)
        .map((indicator) => (
          <HistoryUpload key={indicator.id} indicator={indicator} />
        ))}
    </div>
  );
}

// 5년 표준편차 방식 지표의 과거 값을 한 번에 넣는다 (엑셀에서 두 칸을 복사해 붙여 넣기)
function HistoryUpload({ indicator }: { indicator: ManualIndicatorStatus }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSuccess(null);
    const { rows, errors } = parseHistoryText(text);
    if (errors.length > 0 || rows.length === 0) {
      setMessages(errors.length > 0 ? errors : ["붙여 넣은 값이 없습니다."]);
      return;
    }
    const entries = rows.map((row) => ({ indicatorId: indicator.id, period: row.period, value: row.value }));
    const result = parseManualValues({ entries }, todayInKorea());
    if (!result.ok) {
      setMessages(
        result.errors.map((e) => (e.index >= 0 ? `${rows[e.index].period}: ${e.message}` : e.message)),
      );
      return;
    }

    setSaving(true);
    const response = await postEntries(entries);
    setSaving(false);
    if (response.ok) {
      setMessages([]);
      setText("");
      setSuccess(`${entries.length}개월 값을 저장했어요.`);
      router.refresh();
    } else {
      setMessages([response.message]);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="font-bold">{indicator.name} 과거 값 넣기</h2>
      <p className={`text-sm ${muted}`}>
        이 지표는 앞 5년(60개월) 값의 평균·표준편차로 임계점을 계산합니다. 엑셀에서 &quot;기간, 값&quot; 두 칸을 복사해
        붙여 넣어 주세요. 한 줄에 한 달씩, 예: <code>2021-09	41.2</code> (현재 {indicator.historyCount}/
        {indicator.historyRequired}개월 저장됨)
      </p>
      <textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="rounded border border-black/20 bg-transparent px-2 py-1 font-mono text-sm dark:border-white/25"
        placeholder={"2021-09\t41.2\n2021-10\t40.8"}
      />
      {messages.length > 0 && (
        <ul className="text-xs text-red-600">
          {messages.slice(0, 5).map((message) => (
            <li key={message}>⚠ {message}</li>
          ))}
          {messages.length > 5 && <li>외 {messages.length - 5}건</li>}
        </ul>
      )}
      <div className="flex items-center justify-end gap-3">
        {success && <p className="text-sm text-green-700 dark:text-green-300">{success}</p>}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded border border-black/15 px-4 py-2 hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          {saving ? "저장 중…" : "과거 값 저장"}
        </button>
      </div>
    </section>
  );
}
