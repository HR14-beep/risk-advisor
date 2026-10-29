// OpenAI API 연결 (DESIGN.md §2.1, §8, §9, PLAN 작업 15)
// 실습 단계의 보고서 초안 작성에 쓴다. 실제 업무에서는 사내 AI로 바꾼다 (PRD 7번).
// 키는 서버 쪽 코드에서만 읽는다. 화면(브라우저) 코드에서 이 파일을 불러오면 빌드가 멈춘다.
import "server-only";

const API_URL = "https://api.openai.com/v1/responses";
// 보고서 한 분류(A4 1쪽 남짓)를 쓰는 데 충분한 시간. 생각하는 모델(예: pro)은 2분 넘게 걸릴 수 있다.
// 서버 API 최대 실행 시간(maxDuration 300초) 안에 수집(최대 약 30초)과 저장까지 끝나도록 4분으로 둔다.
// 분류 3개는 동시에 요청하므로 보고서 전체도 이 시간 안에 끝난다
export const TIMEOUT_MS = 240_000;

export class AiConfigError extends Error {
  constructor(missing: string[]) {
    super(`AI 연결 설정을 확인해 주세요. .env에 ${missing.join(", ")} 값을 넣어 주세요.`);
    this.name = "AiConfigError";
  }
}

// auth: 키 오류 / quota: 사용 한도·결제 / model: 모델 이름 오류 / timeout·network: 연결 문제
// server: OpenAI 서버 오류 / incomplete: 생성이 중간에 끊김 / empty: 답이 비어 있음
export type AiErrorKind = "auth" | "quota" | "model" | "timeout" | "network" | "server" | "incomplete" | "empty";

const AI_ERROR_MESSAGES: Record<AiErrorKind, string> = {
  auth: "AI 연결 설정을 확인해 주세요. (키가 맞지 않습니다)",
  quota: "AI 사용 한도를 넘었거나 결제 정보가 없습니다. 잠시 후 다시 시도하거나 OpenAI 결제 설정을 확인해 주세요.",
  model: "AI 연결 설정을 확인해 주세요. (OPENAI_MODEL 모델을 쓸 수 없습니다)",
  timeout: "AI 응답이 4분 넘게 없어 멈췄어요. 다시 만들거나, 더 빠른 모델(OPENAI_MODEL)을 써 주세요.",
  network: "AI 서버에 연결하지 못했어요. 잠시 후 다시 만들어 주세요.",
  server: "AI 서버에 문제가 생겼어요. 잠시 후 다시 만들어 주세요.",
  incomplete: "AI 초안이 중간에 끊겼어요. 다시 만들어 주세요.",
  empty: "AI가 빈 답을 보냈어요. 다시 만들어 주세요.",
};

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    detail?: string,
  ) {
    super(AI_ERROR_MESSAGES[kind]);
    this.name = "AiError";
    if (detail) this.cause = detail;
  }
}

export type GenerateOptions = {
  instructions: string; // AI가 지킬 규칙 (작업 16에서 채운다)
  input: string; // 판정이 끝난 숫자·단계 등 AI에게 넘길 내용
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type GenerateResult = {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
};

type ResponsesBody = {
  status?: string;
  model?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { content?: { type: string; text?: string }[] }[];
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
};

// 응답에서 AI가 쓴 글만 꺼낸다
export function extractText(body: ResponsesBody): string {
  return (body.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text ?? "")
    .join("")
    .trim();
}

function errorKind(status: number): AiErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "quota";
  if (status === 404 || status === 400) return "model";
  return "server";
}

function config(): { key: string; model: string } {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  const missing = [!key && "OPENAI_API_KEY", !model && "OPENAI_MODEL"].filter(
    (name): name is string => Boolean(name),
  );
  if (missing.length > 0) throw new AiConfigError(missing);
  return { key: key!, model: model! };
}

// 키·모델 이름이 있는지 미리 확인한다 (없으면 AiConfigError)
export function assertAiConfigured(): void {
  config();
}

export async function generateText(options: GenerateOptions): Promise<GenerateResult> {
  const { key, model } = config();
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal,
      cache: "no-store",
      body: JSON.stringify({
        model,
        instructions: options.instructions,
        input: options.input,
        max_output_tokens: options.maxOutputTokens,
        // 대외비가 섞일 수 있으므로 OpenAI 쪽에 대화 기록을 남기지 않게 한다
        store: false,
      }),
    });
  } catch (error) {
    throw new AiError(timeout.aborted ? "timeout" : "network", String(error));
  }

  if (!response.ok) {
    throw new AiError(errorKind(response.status), `${response.status} ${await response.text().catch(() => "")}`);
  }

  const body = (await response.json()) as ResponsesBody;
  if (body.status === "incomplete") throw new AiError("incomplete", body.incomplete_details?.reason);
  const text = extractText(body);
  if (!text) throw new AiError("empty");

  return {
    text,
    model: body.model ?? model,
    usage: body.usage
      ? {
          inputTokens: body.usage.input_tokens,
          outputTokens: body.usage.output_tokens,
          totalTokens: body.usage.total_tokens,
        }
      : null,
  };
}
