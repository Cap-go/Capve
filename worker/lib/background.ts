import type { Context } from "hono";

/** Schedules non-essential work after the response; failures are logged, never thrown. */
export type Defer = (task: Promise<unknown>) => void;

export function backgroundTasks(c: Context): Defer {
  let ctx: Pick<ExecutionContext, "waitUntil"> | null = null;
  try {
    ctx = c.executionCtx;
  } catch {
    // No execution context (e.g. direct app.fetch in a script): run detached.
  }
  return (task) => {
    const safe = task.catch((error: unknown) => {
      console.error("background task failed", error);
    });
    ctx?.waitUntil(safe);
  };
}
