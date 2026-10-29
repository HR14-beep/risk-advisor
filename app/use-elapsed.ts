"use client";

// AI 작업을 기다리는 동안 지난 시간 표시 (보고서·원인 분석이 같이 쓴다)
import { useEffect, useState } from "react";

// 시작한 뒤 지난 초. 시작하지 않았으면 0
export function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}

// 버튼을 누른 시각 (클릭할 때만 부른다)
export function startTime(): number {
  return Date.now();
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

