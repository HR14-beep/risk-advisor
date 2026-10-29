// 날짜 계산 도우미. 날짜는 "YYYY-MM-DD" 문자열로 주고받는다.
import { isHoliday } from "@/lib/holidays";

const DAY_MS = 24 * 60 * 60 * 1000;

// 시간대 영향을 받지 않도록 날짜를 UTC 자정으로 다룬다
function toDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return toDateString(new Date(toDate(date).getTime() + days * DAY_MS));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS);
}

// year년 month월(1~12)의 마지막 날. month가 범위를 넘으면 앞뒤 해로 넘어간다
export function monthEnd(year: number, month: number): string {
  return toDateString(new Date(Date.UTC(year, month, 0)));
}

export function isBusinessDay(date: string, calendar: string): boolean {
  const weekday = toDate(date).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isHoliday(date, calendar);
}

export function addBusinessDays(date: string, days: number, calendar: string): string {
  let result = date;
  let remaining = days;
  while (remaining > 0) {
    result = addDays(result, 1);
    if (isBusinessDay(result, calendar)) remaining -= 1;
  }
  return result;
}

// Vercel 서버는 세계 표준시(UTC)로 돌기 때문에 오늘 날짜를 한국 시간으로 구한다
export function todayInKorea(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
