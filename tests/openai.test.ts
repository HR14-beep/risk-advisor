import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigError, AiError, extractCitations, extractText, generateText } from "@/lib/openai";

// 실제 OpenAI를 부르지 않고 가짜 응답으로 채점한다
function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const OK_BODY = {
  status: "completed",
  model: "test-model",
  output: [
    { type: "reasoning", content: [] },
    { type: "message", content: [{ type: "output_text", text: " 초안입니다. " }] },
  ],
  usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
};

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_MODEL", "test-model");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("OpenAI 연결", () => {
  it("규칙과 내용을 보내고, AI가 쓴 글만 꺼내 돌려준다", async () => {
    const fetchMock = mockFetch(200, OK_BODY);
    const result = await generateText({ instructions: "규칙", input: "내용" });

    expect(result).toEqual({
      text: "초안입니다.",
      citations: [],
      model: "test-model",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "test-model",
      instructions: "규칙",
      input: "내용",
      store: false,
    });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  });

  it("키나 모델 이름이 없으면 부르지 않고 설정 안내를 한다", async () => {
    const fetchMock = mockFetch(200, OK_BODY);
    vi.stubEnv("OPENAI_MODEL", "");
    await expect(generateText({ instructions: "", input: "" })).rejects.toThrow(AiConfigError);
    await expect(generateText({ instructions: "", input: "" })).rejects.toThrow("OPENAI_MODEL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, "auth"],
    [429, "quota"],
    [404, "model"],
    [500, "server"],
  ])("응답 %i은 %s 오류", async (status, kind) => {
    mockFetch(status, { error: { message: "x" } });
    await expect(generateText({ instructions: "", input: "" })).rejects.toMatchObject({ kind });
  });

  it("생성이 중간에 끊기거나 답이 비면 다시 만들도록 알린다", async () => {
    mockFetch(200, { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] });
    await expect(generateText({ instructions: "", input: "" })).rejects.toMatchObject({ kind: "incomplete" });

    mockFetch(200, { status: "completed", output: [] });
    await expect(generateText({ instructions: "", input: "" })).rejects.toMatchObject({ kind: "empty" });
  });

  it("서버에 연결하지 못하면 network 오류", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const error = await generateText({ instructions: "", input: "" }).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.kind).toBe("network");
  });

  it("글 조각이 여러 개면 이어 붙인다", () => {
    expect(
      extractText({
        output: [{ content: [{ type: "output_text", text: "가" }, { type: "refusal" }, { type: "output_text", text: "나" }] }],
      }),
    ).toBe("가나");
  });
});

describe("원인 분석용 옵션 (PLAN 작업 22)", () => {
  it("모델·웹 검색·생각 정도·JSON 모양을 요청에 넣는다", async () => {
    const fetchMock = mockFetch(200, OK_BODY);
    await generateText({
      instructions: "규칙",
      input: "내용",
      model: "fast-model",
      webSearch: true,
      reasoningEffort: "low",
      jsonSchema: { name: "x", schema: { type: "object" } },
    });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({
      model: "fast-model",
      tools: [{ type: "web_search" }],
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "x", strict: true } },
      store: false,
    });
  });

  it("웹 검색을 안 쓰면 도구를 보내지 않는다", async () => {
    const fetchMock = mockFetch(200, OK_BODY);
    await generateText({ instructions: "규칙", input: "내용" });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.tools).toBeUndefined();
    expect(body.model).toBe("test-model");
  });

  it("인용 출처는 중복을 빼고 http(s) 주소만 남긴다", () => {
    const annotations = [
      { type: "url_citation", title: "기사 A", url: "https://news.example/a" },
      { type: "url_citation", title: "기사 A", url: "https://news.example/a" },
      { type: "url_citation", title: "나쁜 링크", url: "javascript:alert(1)" },
      { type: "file_citation", url: "https://x" },
    ];
    expect(
      extractCitations({ output: [{ content: [{ type: "output_text", text: "t", annotations }] }] }),
    ).toEqual([{ title: "기사 A", url: "https://news.example/a" }]);
  });
});
