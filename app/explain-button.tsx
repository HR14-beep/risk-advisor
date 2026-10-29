"use client";

// 위험 신호 원인 분석 버튼과 결과 창 (DESIGN.md §3.1, §4.4, PLAN 작업 22)
// 누르면 저장된 분석을 보여 주고, 없으면 AI가 새로 분석한다. "다시 분석"은 저장된 분석이 있어도 새로 만든다.
import { useRef, useState } from "react";
import type { Explanation } from "@/lib/explain";
import { periodLabel } from "@/lib/period";
import { BUTTON_SECONDARY, NOTICE_ERROR, NOTICE_INFO, TAG } from "@/lib/ui";
import { formatElapsed, startTime, useElapsedSeconds } from "./use-elapsed";

type Response = { notice?: string; explanation?: Explanation | null; error?: string };

const BASIS = {
  data: { label: "데이터", className: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300" },
  news: { label: "기사", className: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300" },
} as const;

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function Waiting({ startedAt }: { startedAt: number }) {
  const seconds = useElapsedSeconds(startedAt);
  return (
    <div role="status" aria-live="polite" className={`${NOTICE_INFO} flex items-center gap-3`}>
      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
      <span>
        AI가 원인을 찾는 중이에요 · {formatElapsed(seconds)} 지남 <span className="text-muted">(보통 10~40초)</span>
      </span>
    </div>
  );
}

function Result({ explanation, notice }: { explanation: Explanation; notice: string }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
        ⚠ {notice}
        {explanation.usedWebSearch ? " · 웹 검색 포함" : " · 앱 데이터만 사용"}
        {explanation.isSample && " · 실습용 가상 값 기준"}
      </p>
      <p className="text-sm leading-relaxed">{explanation.summary}</p>
      <ul className="flex flex-col gap-2">
        {explanation.factors.map((factor, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
            <span className={`${TAG} mt-0.5 shrink-0 ${BASIS[factor.basis].className}`}>{BASIS[factor.basis].label}</span>
            <span>{factor.text}</span>
          </li>
        ))}
      </ul>
      {explanation.check && (
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm">
          <span className="font-medium">확인해 볼 점 </span>
          {explanation.check}
        </p>
      )}
      {explanation.sources.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted">출처</p>
          <ul className="mt-1 flex flex-col gap-1">
            {explanation.sources.map((source) => (
              <li key={source.url} className="truncate text-xs">
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted">
        {periodLabel(explanation.period)} 기준 · {formatTime(explanation.createdAt)} 분석
      </p>
    </div>
  );
}

export function ExplainButton({ indicatorId, indicatorName }: { indicatorId: string; indicatorName: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [data, setData] = useState<Response | null>(null);

  async function run(force: boolean) {
    setStartedAt(startTime());
    setData(null);
    try {
      const response = await fetch(`/api/indicators/${encodeURIComponent(indicatorId)}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      setData((await response.json()) as Response);
    } catch {
      setData({ error: "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setStartedAt(null);
    }
  }

  function open() {
    dialog.current?.showModal();
    if (!data?.explanation && startedAt === null) void run(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-accent ring-1 ring-inset ring-accent/30 hover:bg-accent-soft"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden>
          <path d="M10 1.5l1.9 4.6 4.6 1.9-4.6 1.9L10 14.5l-1.9-4.6L3.5 8l4.6-1.9L10 1.5zM16 13l.9 2.1 2.1.9-2.1.9L16 19l-.9-2.1L13 16l2.1-.9L16 13z" />
        </svg>
        원인 분석
      </button>
      <dialog
        ref={dialog}
        className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-foreground shadow-xl backdrop:bg-slate-950/40"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">{indicatorName} · 위험 신호 원인</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="rounded-md px-2 py-1 text-muted hover:bg-surface-muted"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-5 py-4">
          {startedAt !== null && <Waiting startedAt={startedAt} />}
          {data?.error && <p className={NOTICE_ERROR}>{data.error}</p>}
          {data?.explanation && <Result explanation={data.explanation} notice={data.notice ?? ""} />}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" className={BUTTON_SECONDARY} disabled={startedAt !== null} onClick={() => void run(true)}>
            다시 분석
          </button>
        </div>
      </dialog>
    </>
  );
}
