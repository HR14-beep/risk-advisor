@AGENTS.md

# 작업 규칙

- `.env`나 `app/globals.css`를 바꾼 뒤에는 개발 서버를 다시 켜고, "연결 성공·완료"는 실제 명령 출력(`npm run db:check` 등)이나 브라우저 화면으로 확인한 뒤에만 쓴다. 점검 스크립트는 빈 결과(null·0건)도 실패로 처리한다.
- 판정 규칙(임계점·발표 시점·출처·단계)을 바꾸면 같은 작업 안에서 PRD.md·PLAN.md·DESIGN.md·CHECK.md 중 해당 문서도 함께 고친다.
