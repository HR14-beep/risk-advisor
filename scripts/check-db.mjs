// 저장소 연결 확인 (PLAN 작업 8). 실행: npm run db:check
// .env의 값은 화면에 출력하지 않고, 있음/없음과 연결 결과만 보여 준다. 저장소 내용은 바꾸지 않는다.
import { createClient } from "@supabase/supabase-js";

const TABLES = ["indicator_values", "reports", "report_sections"];
const KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

let ok = true;
for (const key of KEYS) {
  const present = Boolean(process.env[key]);
  console.log(`${present ? "✅" : "❌"} ${key}: ${present ? "값 있음" : "없음"}`);
  ok &&= present;
}
if (!ok) {
  console.log("\n.env에 빠진 값을 넣은 뒤 다시 실행해 주세요.");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

for (const table of TABLES) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  // 표가 없으면 오류 없이 줄 수만 비어서 오는 경우가 있어, 그것도 실패로 본다
  if (error || count === null) {
    ok = false;
    const missing = !error || error.code === "PGRST205" || error.code === "42P01";
    const hint = missing ? " → supabase/schema.sql을 SQL Editor에서 실행해 주세요" : "";
    console.log(`❌ ${table}: ${error?.message ?? "표를 찾지 못했습니다"}${hint}`);
  } else {
    console.log(`✅ ${table}: 연결됨 (${count}줄)`);
  }
}

console.log(ok ? "\n저장소 연결 성공" : "\n저장소 연결에 문제가 있습니다");
process.exit(ok ? 0 : 1);
