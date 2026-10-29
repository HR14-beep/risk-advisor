import type { Metadata } from "next";
import Link from "next/link";
import { Noto_Sans_KR } from "next/font/google";
import { ROUTES, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
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

// 모든 화면이 공유하는 틀: 상단 앱 이름, 본문 영역, 하단 안내 (PLAN 작업 1)
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-black/10 dark:border-white/15">
          <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-3">
            <Link href={ROUTES.dashboard} className="text-lg font-bold">
              {SITE_NAME}
            </Link>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6">
          {children}
        </main>
        <footer className="border-t border-black/10 dark:border-white/15">
          <p className="mx-auto w-full max-w-6xl px-4 py-3 text-xs text-black/60 dark:text-white/60">
            실습용 화면입니다. 직접 입력 지표에는 가상 값만 사용합니다.
          </p>
        </footer>
      </body>
    </html>
  );
}
