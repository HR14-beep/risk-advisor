// 메일 보내기 (Resend 공개 API, PLAN 작업 20). 키는 서버 쪽 코드에서만 읽는다
import "server-only";

const API_URL = "https://api.resend.com/emails";
// Resend가 기본으로 주는 보내는 주소. 도메인을 등록하면 NOTIFY_FROM으로 바꾼다
const DEFAULT_FROM = "위기관리 신호등 <onboarding@resend.dev>";

export class MailConfigError extends Error {
  constructor(missing: string[]) {
    super(`메일 설정을 확인해 주세요. .env에 ${missing.join(", ")} 값을 넣어 주세요.`);
    this.name = "MailConfigError";
  }
}

export class MailError extends Error {
  constructor(status: number) {
    super(
      status === 401 || status === 403
        ? "메일 발송 키가 맞지 않거나, 이 주소로 보낼 권한이 없어요."
        : `메일 발송 서비스 응답 오류 (${status})`,
    );
    this.name = "MailError";
  }
}

export function mailConfig(): { key: string; to: string; from: string } {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_TO;
  const missing = [!key && "RESEND_API_KEY", !to && "NOTIFY_TO"].filter((n): n is string => Boolean(n));
  if (missing.length > 0) throw new MailConfigError(missing);
  return { key: key!, to: to!, from: process.env.NOTIFY_FROM || DEFAULT_FROM };
}

export async function sendMail(mail: { subject: string; html: string; text: string }): Promise<{ to: string }> {
  const { key, to, from } = mailConfig();
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) {
    // 응답 본문에는 키가 들어 있지 않지만, 로그에는 상태만 남긴다
    console.error("메일 발송 실패", response.status);
    throw new MailError(response.status);
  }
  return { to };
}
