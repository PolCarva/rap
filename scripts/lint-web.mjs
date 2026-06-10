import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { ESLint } = require("../apps/web/node_modules/eslint");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cwd = path.join(root, "apps/web");
const eslint = new ESLint({ cwd });
const results = await eslint.lintFiles(["src", "next.config.ts", "open-next.config.ts"]);
const formatter = await eslint.loadFormatter("stylish");
const output = formatter.format(results);

if (output) process.stdout.write(`${output}\n`);

const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
const warnings = results.reduce((sum, result) => sum + result.warningCount, 0);

if (errors > 0) process.exit(1);
console.log(`ESLint OK (${warnings} warning${warnings === 1 ? "" : "s"})`);
