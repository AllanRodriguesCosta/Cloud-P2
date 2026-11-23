import { defineConfig } from "vitest/config";

// Testes do servidor rodam em Node; os do cliente declaram "@vitest-environment happy-dom" no topo.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["server/tests/**/*.test.js", "client/src/**/*.test.{js,jsx}"],
    environment: "node",
  },
});
