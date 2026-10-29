// 앱 전체에서 같이 쓰는 이름과 화면 주소 (DESIGN.md §3)
export const SITE_NAME = "위기관리 신호등";
export const SITE_DESCRIPTION =
  "외부 경제지표 변동을 자동으로 모니터링하고 리스크 보고서 초안을 만드는 리스크관리부 도구";

export const ROUTES = {
  dashboard: "/",
  input: "/input",
  report: "/report",
} as const;

// 메일 알림의 "지표 현황 보기" 링크에 쓰는 배포 주소
export const SITE_URL = process.env.SITE_URL || "https://risk-advisor-beta.vercel.app";
