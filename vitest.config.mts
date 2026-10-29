import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 판정 계산 같은 lib/ 로직을 채점한다 (DESIGN.md §10)
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // 테스트는 서버(Node)에서 돌므로, 서버 전용 표시(server-only)를 빈 파일로 바꿔 서버 코드도 채점할 수 있게 한다
    alias: {
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
