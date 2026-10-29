import type { Metadata } from "next";
import Link from "next/link";
import { Noto_Sans_KR } from "next/font/google";
import { ROUTES, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { SiteNav } from "./site-nav";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
};

// 모든 화면이 공유하는 틀: 상단 앱 이름·메뉴, 본문 영역, 하단 안내 (PLAN 작업 1)
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 border-b border-line bg-surface/85 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href={ROUTES.dashboard} className="flex items-center gap-2.5">
              {/* 앱 표시: 올라가는 선 그래프 */}
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white dark:text-slate-950">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4.5 w-4.5" aria-hidden>
                  <path d="M3 17l5-5 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M15 8h5v5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="flex flex-col leading-tight">
                <span className="font-bold tracking-tight">{SITE_NAME}</span>
                <span className="text-xs text-muted">리스크관리부 지표 모니터링</span>
              </span>
            </Link>
            <SiteNav />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8">{children}</main>
        <footer className="border-t border-line">
          <p className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-muted">
            실습용 화면입니다. 직접 입력 지표에는 가상 값만 사용합니다.
          </p>
        </footer>
      </body>
    </html>
  );
}
