// Minimal types for the Node built-ins scripts/prerender.tsx uses (Bun runs it; the repo has no @types/node).
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}
declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
}
declare module "node:url" {
  export function fileURLToPath(url: URL | string): string;
}
