// 저장소(Supabase) 연결 (DESIGN.md §2.1, §9, PLAN 작업 8)
// 서버용 키는 저장소의 모든 표를 읽고 쓸 수 있으므로 서버 쪽 코드에서만 쓴다.
// 화면(브라우저) 코드에서 이 파일을 불러오면 빌드가 멈춘다.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class StoreConfigError extends Error {
  constructor(missing: string[]) {
    super(`저장소 설정이 없습니다. .env에 ${missing.join(", ")} 값을 넣어 주세요.`);
    this.name = "StoreConfigError";
  }
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [!url && "SUPABASE_URL", !key && "SUPABASE_SERVICE_ROLE_KEY"].filter(
    (name): name is string => Boolean(name),
  );
  if (missing.length > 0) throw new StoreConfigError(missing);

  // 서버에서만 쓰므로 로그인 세션을 저장하지 않는다
  client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
