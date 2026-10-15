declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    AUTH_SECRET: string;
  }
}

export {};
