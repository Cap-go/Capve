import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.vitest.toml" },
        miniflare: {
          bindings: {
            APP_URL: "http://localhost:5173",
            AUTH_SECRET: "test-auth-secret-at-least-32-characters-long",
            PLATFORM_ADMIN_EMAILS: "martindonadieu@gmail.com",
          },
        },
      },
    },
    include: ["tests/**/*.test.ts"],
  },
});
