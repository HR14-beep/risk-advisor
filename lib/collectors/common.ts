// 수집기들이 같이 쓰는 것 (PLAN 작업 10~11)
import { periodEnd } from "@/lib/period";

export class CollectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollectorError";
  }
}

const TIMEOUT_MS = 15_000;

// 주소에 인증키가 들어가므로, 오류 문구에는 주소를 넣지 않는다
export async function fetchJson(url: string, sourceName: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new CollectorError(`${sourceName}에 연결하지 못했습니다`);
  }
  if (!response.ok) throw new CollectorError(`${sourceName} 응답 오류 (${response.status})`);
  try {
    return await response.json();
  } catch {
    throw new CollectorError(`${sourceName} 응답을 읽지 못했습니다`);
  }
}

export function requireKey(name: string): string {
  const key = process.env[name];
  if (!key) throw new CollectorError(`${name}가 .env에 없습니다`);
  return key;
}

// "202608" → 그 달 말일, 분기 "2026"+"2" → 분기말
export function monthKeyToDate(yyyymm: string): string | null {
  return /^\d{6}$/.test(yyyymm) ? periodEnd(`${yyyymm.slice(0, 4)}-${yyyymm.slice(4)}`) : null;
}

export function quarterToDate(year: string, quarter: number): string | null {
  return /^\d{4}$/.test(year) && quarter >= 1 && quarter <= 4 ? periodEnd(`${year}-Q${quarter}`) : null;
}

// 같은 요청을 짧은 시간 안에 여러 지표가 쓰면 한 번만 부른다 (예: FISIS 은행별 자료를 4개 지표가 나눠 씀)
export function memoize<T>(fn: (key: string) => Promise<T>, ttlMs = 60_000): (key: string) => Promise<T> {
  const cache = new Map<string, { at: number; value: Promise<T> }>();
  return (key) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = fn(key);
    cache.set(key, { at: Date.now(), value });
    value.catch(() => cache.delete(key));
    return value;
  };
}
