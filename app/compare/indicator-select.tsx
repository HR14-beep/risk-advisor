"use client";

// 비교할 지표 고르기: 고르면 주소 ?id=지표 번호로 바로 바꾼다
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/indicators";
import { ROUTES } from "@/lib/site";

export type IndicatorOption = { id: string; name: string; category: Category; note?: string };

export function IndicatorSelect({ options, value }: { options: IndicatorOption[]; value: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">지표</span>
      <select
        value={value}
        onChange={(e) => startTransition(() => router.push(`${ROUTES.compare}?id=${encodeURIComponent(e.target.value)}`))}
        className="min-w-64 rounded-lg border border-line bg-surface px-3 py-1.5 shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      >
        {CATEGORIES.map((category) => (
          <optgroup key={category} label={CATEGORY_LABELS[category]}>
            {options
              .filter((o) => o.category === category)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.note ? ` (${o.note})` : ""}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {pending && <span className="text-xs text-muted">불러오는 중…</span>}
    </label>
  );
}
