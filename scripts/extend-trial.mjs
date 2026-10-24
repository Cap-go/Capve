// Use an exact, reviewed account ID. This script never guesses an account from its display name.
import { execFileSync } from "node:child_process";
const args = process.argv.slice(2);
const account = args.find((arg) => arg.startsWith("--account="))?.slice(10);
if (!account || !/^usr_[a-zA-Z0-9_-]+$/.test(account)) {
  throw new Error("Usage: bun scripts/extend-trial.mjs --account=usr_EXACT_ID [--remote]");
}
const now = new Date();
const end = new Date(now); end.setUTCFullYear(end.getUTCFullYear() + 3);
const command = `UPDATE account_billing SET trial_started_at = ${now.getTime()}, trial_ends_at = ${end.getTime()}
 WHERE account_id = '${account}' RETURNING account_id;
 SELECT u.id, u.email, b.plan, datetime(b.trial_ends_at / 1000, 'unixepoch') AS trial_end_utc
 FROM account_billing b JOIN users u ON u.id = b.account_id WHERE b.account_id = '${account}';`;
const remote = args.includes("--remote");
const output = execFileSync("bunx", ["wrangler", "d1", "execute", "velo-db", remote ? "--remote" : "--local",
  ...(remote ? ["--env", "production"] : []), "--command", command, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const results = JSON.parse(output);
if (!Array.isArray(results) || results[0]?.results?.length !== 1 || results[0].results[0].account_id !== account || results[1]?.results?.length !== 1) {
  throw new Error(`Trial extension failed: expected exactly one billing account for ${account}`);
}
console.log(JSON.stringify(results[1].results[0], null, 2));
