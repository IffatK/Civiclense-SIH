/**
 * Brace balance for a stylesheet.
 *
 * The other checks read JavaScript. None of them opens the CSS, so an
 * unbalanced brace from a bad edit reaches the browser as a PostCSS failure
 * with no indication of which line caused it.
 */
import fs from "node:fs";

const file = process.argv[2];
const raw = fs.readFileSync(file, "utf8");

// Braces inside comments and strings are not structure.
const src = raw
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');

let depth = 0;
let line = 1;
let problems = 0;

for (const ch of src) {
  if (ch === "\n") line += 1;
  else if (ch === "{") depth += 1;
  else if (ch === "}") {
    depth -= 1;
    if (depth < 0) {
      console.log(`  ✗ line ${line}: unexpected }`);
      problems += 1;
      depth = 0;
    }
  }
}

if (depth > 0) {
  console.log(`  ✗ ${depth} unclosed block${depth === 1 ? "" : "s"} at end of file`);
  problems += 1;
}

console.log(problems ? `\n${problems} problem(s) in ${file}` : `${file}: braces balanced`);
process.exit(problems ? 1 : 0);
