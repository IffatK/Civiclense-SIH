/**
 * Legacy compatibility entry point.
 *
 * The old random generator created records that could not be traced to valid
 * DEMO citizen reporters or bucket-backed evidence. Keep this filename for
 * existing documentation, but always delegate to the idempotent workflow seed.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const serverDir = fileURLToPath(new URL("../server/", import.meta.url));
const child = spawn(process.execPath, ["scripts/seed-demo.js", ...process.argv.slice(2)], {
  cwd: serverDir,
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
