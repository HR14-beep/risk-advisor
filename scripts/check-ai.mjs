// OpenAI API 연결 확인 (PLAN 작업 14). 실행: npm run ai:check
// .env의 값은 화면에 출력하지 않는다.
// 1단계: 키로 모델 목록을 불러와 키가 맞는지 본다 (비용 없음)
// 2단계: OPENAI_MODEL이 있으면 짧은 문장 하나로 시험 호출한다 (아주 적은 비용)
const API = "https://api.openai.com/v1";
const key = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;

console.log(`${key ? "✅" : "❌"} OPENAI_API_KEY: ${key ? "값 있음" : "없음"}`);
console.log(`${model ? "✅" : "⚠"} OPENAI_MODEL: ${model ? `값 있음 (${model})` : "없음"}`);
if (!key) {
  console.log("\n.env에 OPENAI_API_KEY를 넣은 뒤 다시 실행해 주세요.");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

function explain(status) {
  if (status === 401) return "키가 맞지 않습니다. 키를 다시 확인해 주세요.";
  if (status === 403) return "이 키로는 쓸 수 없는 기능이나 모델입니다.";
  if (status === 404) return "모델 이름을 찾을 수 없습니다. OPENAI_MODEL을 확인해 주세요.";
  if (status === 429) return "사용 한도를 넘었거나 결제 정보가 없습니다. OpenAI 결제(Billing) 화면을 확인해 주세요.";
  return `OpenAI 서버 응답 오류 (${status})`;
}

// 1단계: 모델 목록
let models;
try {
  const response = await fetch(`${API}/models`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    console.log(`❌ 키 확인 실패: ${explain(response.status)}`);
    process.exit(1);
  }
  models = (await response.json()).data.map((m) => m.id);
} catch {
  console.log("❌ OpenAI 서버에 연결하지 못했습니다. 인터넷 연결이나 회사 방화벽을 확인해 주세요.");
  process.exit(1);
}
console.log(`✅ 키 확인: 쓸 수 있는 모델 ${models.length}개`);

if (!model) {
  // 글을 쓰는 모델만 고른다 (음성·이미지·검색 전용 모델과 날짜가 붙은 고정판은 뺀다)
  const suggestions = models
    .filter((id) => /^gpt-/.test(id))
    .filter((id) => !/realtime|audio|transcribe|tts|image|search|embedding|codex|\d{4}-\d{2}-\d{2}/.test(id))
    .sort()
    .reverse()
    .slice(0, 10);
  console.log(`\n.env에 OPENAI_MODEL을 넣으면 시험 호출까지 해 봅니다. 쓸 수 있는 gpt 모델 예: ${suggestions.join(", ")}`);
  process.exit(0);
}
if (!models.includes(model)) {
  console.log(`❌ OPENAI_MODEL(${model})이 이 키로 쓸 수 있는 모델 목록에 없습니다.`);
  process.exit(1);
}

// 2단계: 시험 호출 (지표 수치는 보내지 않는다)
try {
  const response = await fetch(`${API}/responses`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ model, input: "연결 확인입니다. '연결 성공'이라고만 답해 주세요." }),
  });
  if (!response.ok) {
    console.log(`❌ 시험 호출 실패: ${explain(response.status)}`);
    process.exit(1);
  }
  const body = await response.json();
  const text = (body.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text)
    .join("")
    .trim();
  console.log(`✅ 시험 호출 성공: "${text}" (사용 토큰 ${body.usage?.total_tokens ?? "?"}개)`);
} catch {
  console.log("❌ 시험 호출 중 연결이 끊겼습니다. 잠시 후 다시 실행해 주세요.");
  process.exit(1);
}

console.log("\nOpenAI 연결 성공");
