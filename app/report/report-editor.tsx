"use client";

// 보고서 초안 편집과 다시 만들기 (DESIGN.md §3.3, PLAN 작업 17~18)
// 분류마다 글 상자로 고치고, 전체 리스크 수준을 담당자가 고른 뒤 저장한다
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS, type Category } from "@/lib/indicators";
import { periodLabel } from "@/lib/period";
import { AI_DRAFT_NOTICE } from "@/lib/report-prompt";
import { OVERALL_LEVELS, OVERALL_LEVEL_LABELS, isEdited, type OverallLevel } from "@/lib/report-schema";
import type { ReportRecord, ReportWithSections } from "@/lib/report-store";
import { ROUTES } from "@/lib/site";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, NOTICE_WARN, TAG } from "@/lib/ui";

const muted = "text-muted";

// 초안을 만든 직후의 점검 결과는 저장소에 없으므로, 같은 탭 안에서만 잠깐 넘겨 보여 준다
const warningsKey = (id: number) => `report-warnings-${id}`;
type SectionWarnings = Partial<Record<Category, string[]>>;

function readWarnings(id: number): SectionWarnings {
  try {
    return JSON.parse(sessionStorage.getItem(warningsKey(id)) ?? "{}");
  } catch {
    return {};
  }
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function reportTitle(report: ReportRecord): string {
  return `${periodLabel(report.report_month)} 리스크 보고서 (${report.round}차)`;
}

export function CreateReportButton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/reports", { method: "POST" });
      const body = await response.json();
      if (!body.report) {
        setError(body.error ?? "초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      const warnings: SectionWarnings = Object.fromEntries(
        (body.sections as { category: Category; warnings: string[]; error: string | null }[]).map((s) => [
          s.category,
          s.error ? [s.error, ...s.warnings] : s.warnings,
        ]),
      );
      try {
        sessionStorage.setItem(warningsKey(body.report.id), JSON.stringify(warnings));
      } catch {
        // 저장하지 못해도 보고서는 열린다
      }
      router.push(`${ROUTES.report}?id=${body.report.id}`);
    } catch {
      setError("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setCreating(false);
    }
  }

  const style =
    variant === "primary"
      ? BUTTON_PRIMARY
      : BUTTON_SECONDARY;
  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" onClick={create} disabled={creating} className={style}>
        {creating ? "초안 만드는 중… (몇십 초 걸릴 수 있어요)" : "새 초안 만들기"}
      </button>
      {error && <p className="text-sm text-red-600">⚠ {error}</p>}
    </div>
  );
}

type RegeneratedSection = { category: Category; aiDraft: string | null; error: string | null; warnings: string[] };
type RegenerateBody = {
  report?: ReportWithSections;
  sections?: RegeneratedSection[];
  skipped?: Category[];
  error?: string;
};

export function ReportEditor({ report, siblings }: { report: ReportWithSections; siblings: ReportRecord[] }) {
  const router = useRouter();
  const initialTexts = () =>
    Object.fromEntries(report.sections.map((s) => [s.category, s.edited_text ?? s.ai_draft ?? ""])) as Record<
      Category,
      string
    >;
  // 다시 만들면 AI 초안이 바뀌므로 섹션도 상태로 들고 있는다
  const [sections, setSections] = useState(report.sections);
  const [texts, setTexts] = useState(initialTexts);
  const [savedTexts, setSavedTexts] = useState(initialTexts);
  const [level, setLevel] = useState<OverallLevel | null>(report.overall_level);
  const [savedLevel, setSavedLevel] = useState<OverallLevel | null>(report.overall_level);
  const [savedAt, setSavedAt] = useState(report.saved_at);
  const [saving, setSaving] = useState(false);
  // 다시 만드는 중인 분류 ("all"이면 전체)
  const [regenerating, setRegenerating] = useState<Category | "all" | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [warnings, setWarnings] = useState<SectionWarnings>({});

  const busy = saving || regenerating !== null;
  const dirty = level !== savedLevel || sections.some((s) => texts[s.category] !== savedTexts[s.category]);

  useEffect(() => {
    // 브라우저 저장 공간은 화면을 그린 뒤에만 읽을 수 있다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWarnings(readWarnings(report.id));
  }, [report.id]);

  // 저장하지 않고 창을 닫으려 하면 한 번 묻는다
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save(): Promise<boolean> {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/reports/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overallLevel: level,
          sections: sections.map((s) => ({ category: s.category, text: texts[s.category] })),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setNotice({ kind: "error", text: body.error ?? "저장하지 못했어요." });
        return false;
      }
      setSections(body.sections);
      setSavedTexts(texts);
      setSavedLevel(level);
      setSavedAt(body.saved_at);
      setNotice({ kind: "success", text: "저장했어요." });
      router.refresh();
      return true;
    } catch {
      setNotice({ kind: "error", text: "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." });
      return false;
    } finally {
      setSaving(false);
    }
  }

  // 다시 만들기: 고친 섹션은 건너뛰고, 다시 만든 섹션만 새 AI 초안으로 바꾼다
  async function regenerate(only?: Category) {
    // 전체 다시 만들기 전에 고친 내용을 먼저 저장해, 고친 섹션이 [고침]으로 지켜지게 한다
    if (!only && dirty && !(await save())) return;

    setRegenerating(only ?? "all");
    setNotice(null);
    try {
      const url = only
        ? `/api/reports/${report.id}/sections/${only}/regenerate`
        : `/api/reports/${report.id}/regenerate`;
      const response = await fetch(url, { method: "POST" });
      const body = (await response.json()) as RegenerateBody;
      if (!body.report || !body.sections) {
        setNotice({ kind: "error", text: body.error ?? "다시 만들지 못했어요." });
        return;
      }

      const replaced = body.sections.filter((s) => s.aiDraft !== null);
      const newTexts = Object.fromEntries(replaced.map((s) => [s.category, s.aiDraft!]));
      setSections(body.report.sections);
      setTexts((current) => ({ ...current, ...newTexts }));
      setSavedTexts((current) => ({ ...current, ...newTexts }));
      setWarnings((current) => ({
        ...current,
        ...Object.fromEntries(body.sections!.map((s) => [s.category, s.error ? [s.error, ...s.warnings] : s.warnings])),
      }));

      const failed = body.sections.filter((s) => s.error).length;
      const skipped = body.skipped?.length ?? 0;
      const parts = [
        replaced.length > 0 && `${replaced.length}개 분류를 다시 만들었어요`,
        skipped > 0 && `고친 ${skipped}개 분류는 건너뛰었어요`,
        failed > 0 && `${failed}개 분류는 실패해 이전 초안을 그대로 두었어요`,
      ].filter(Boolean);
      setNotice({ kind: failed > 0 ? "error" : "success", text: `${parts.join(" · ") || "다시 만들 분류가 없어요"}.` });
      router.refresh();
    } catch {
      setNotice({ kind: "error", text: "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setRegenerating(null);
    }
  }

  function open(id: string) {
    if (dirty && !window.confirm("저장하지 않은 내용이 있어요. 다른 보고서로 이동할까요?")) return;
    router.push(`${ROUTES.report}?id=${id}`);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 제목과 같은 달 목록 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{reportTitle(report)}</h1>
        <label className="flex items-center gap-2 text-sm">
          같은 달 목록
          <select
            value={report.id}
            onChange={(e) => open(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-sm"
          >
            {siblings.map((s) => (
              <option key={s.id} value={s.id}>
                {s.round}차 · {formatTime(s.created_at)} 생성{s.saved_at ? " · 저장됨" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className={`${NOTICE_WARN} font-semibold`}>
        ⚠ {AI_DRAFT_NOTICE}
      </p>

      {/* 전체 리스크 수준: AI가 아니라 담당자가 고른다 */}
      <fieldset className={`${CARD} flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4`}>
        <legend className="px-1 text-sm font-bold">전체 리스크 수준 (담당자 선택)</legend>
        {OVERALL_LEVELS.map((value) => (
          <label key={value} className="flex items-center gap-1.5">
            <input
              type="radio"
              name="overall-level"
              checked={level === value}
              onChange={() => {
                setLevel(value);
                setNotice(null);
              }}
            />
            {OVERALL_LEVEL_LABELS[value]}
          </label>
        ))}
        {level === null && <span className={`text-sm ${muted}`}>아직 고르지 않았어요</span>}
      </fieldset>

      {/* 분류별 섹션 */}
      {sections.map((section, index) => {
        const text = texts[section.category];
        const edited = isEdited(section.ai_draft, text);
        const sectionWarnings = warnings[section.category] ?? [];
        const thisRegenerating = regenerating === section.category || regenerating === "all";
        return (
          <section key={section.id} className={`${CARD} flex flex-col gap-3 p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold">
                  {index + 1}. {CATEGORY_LABELS[section.category]}
                </h2>
                {edited && (
                  <span className={`${TAG} bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300`}>고침</span>
                )}
                {section.ai_draft === null && (
                  <span className={`${TAG} bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300`}>생성 실패</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => regenerate(section.category)}
                disabled={busy || edited}
                title={edited ? "고친 섹션은 다시 만들지 않아요. 고친 내용을 AI 초안으로 되돌리면 다시 만들 수 있어요." : undefined}
                className={`${BUTTON_SECONDARY} px-3 py-1.5`}
              >
                {thisRegenerating ? "다시 만드는 중…" : "이 부분 다시 만들기"}
              </button>
            </div>
            {section.ai_draft === null && (
              <p className={`text-sm ${muted}`}>
                이 분류는 AI 초안을 만들지 못했어요. &quot;이 부분 다시 만들기&quot;를 누르거나 직접 써 주세요.
              </p>
            )}
            {sectionWarnings.length > 0 && (
              <ul className={NOTICE_WARN}>
                {sectionWarnings.map((w) => (
                  <li key={w}>⚠ 확인 필요: {w}</li>
                ))}
              </ul>
            )}
            <textarea
              aria-label={`${CATEGORY_LABELS[section.category]} 내용`}
              rows={18}
              value={text}
              readOnly={thisRegenerating}
              onChange={(e) => {
                setTexts({ ...texts, [section.category]: e.target.value });
                setNotice(null);
              }}
              className="w-full rounded-lg border border-line bg-surface px-4 py-3 leading-relaxed shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 read-only:opacity-60"
            />
          </section>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <CreateReportButton variant="secondary" />
        <div className="flex flex-wrap items-center gap-3">
          {notice && (
            <p className={`text-sm ${notice.kind === "success" ? "text-green-700 dark:text-green-300" : "text-red-600"}`}>
              {notice.text}
            </p>
          )}
          <span className={`text-sm ${muted}`}>
            {dirty ? "저장하지 않은 내용이 있어요" : savedAt ? `마지막 저장: ${formatTime(savedAt)}` : "아직 저장하지 않았어요"}
          </span>
          <button
            type="button"
            onClick={() => regenerate()}
            disabled={busy}
            title="고친 섹션([고침])은 건너뛰고 나머지만 새로 만들어요"
            className={BUTTON_SECONDARY}
          >
            {regenerating === "all" ? "다시 만드는 중… (몇십 초 걸릴 수 있어요)" : "전체 다시 만들기"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            className={BUTTON_PRIMARY}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
