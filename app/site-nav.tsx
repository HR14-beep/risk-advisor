"use client";

// 상단 메뉴: 지금 보고 있는 화면을 강조한다
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/lib/site";

const ITEMS = [
  { href: ROUTES.dashboard, label: "지표 현황" },
  { href: ROUTES.input, label: "직접 입력" },
  { href: ROUTES.report, label: "보고서" },
  { href: ROUTES.compare, label: "지표 비교" },
];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
