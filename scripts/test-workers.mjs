import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const vitest = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const args = process.argv.slice(2);

function runVitest(args, capture = false) {
  const result = spawnSync(process.execPath, [vitest, ...args], {
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout;
}

// Keep normal Vitest arguments available for focused runs.
if (args.length > 0) {
  runVitest(["run", ...args]);
} else {
  // This pool version either starts every file's runtime concurrently or shares
  // one runtime for the whole suite. Fresh sequential processes bound resource
  // use without disabling storage isolation or relaxing test timeouts.
  const files = JSON.parse(runVitest(["list", "--filesOnly", "--json"], true));
  if (files.length === 0) throw new Error("No Workers test files found");
  for (const [index, { file }] of files.entries()) {
    console.log(`\nWorkers test file ${index + 1}/${files.length}: ${file}`);
    runVitest(["run", file]);
  }
  console.log(`\nAll ${files.length} Workers test files passed.`);
}
