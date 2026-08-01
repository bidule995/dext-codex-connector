import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const base = process.argv[2];
if (!base || /^0+$/u.test(base)) {
  process.stdout.write(
    "No comparison base supplied; plugin version-change check skipped.\n"
  );
  process.exit(0);
}

const changed = execFileSync(
  "git",
  ["diff", "--name-only", `${base}...HEAD`],
  { encoding: "utf8" }
)
  .split(/\r?\n/u)
  .filter(Boolean);
const affectsPluginRuntime = changed.some((path) =>
  [
    ".mcp.json",
    "assets/",
    "package.json",
    "pnpm-lock.yaml",
    "plugin/runtime/",
    "scripts/build-plugin.mjs",
    "src/auth/types.ts",
    "src/connections/provider-resolver.ts",
    "src/contracts/",
    "src/errors.ts",
    "src/mcp/",
    "src/plugin/",
    "src/providers/dext-commerce/catalog.ts",
    "src/providers/dext-health/",
    "src/providers/dext-prepare/status.ts",
    "src/services/",
    "src/storage/repositories.ts",
    "src/version.ts"
  ].some((prefix) => path === prefix || path.startsWith(prefix))
);

if (!affectsPluginRuntime) {
  process.stdout.write("No plugin runtime change detected.\n");
  process.exit(0);
}

const current = JSON.parse(
  await readFile(
    new URL("../.codex-plugin/plugin.json", import.meta.url),
    "utf8"
  )
).version;
let previous;
try {
  previous = JSON.parse(
    execFileSync("git", ["show", `${base}:.codex-plugin/plugin.json`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
  ).version;
} catch {
  process.stdout.write(`Plugin manifest is new at version ${current}.\n`);
  process.exit(0);
}

if (current === previous) {
  throw new Error(
    `Plugin runtime changed without incrementing .codex-plugin/plugin.json from ${previous}.`
  );
}
process.stdout.write(`Plugin version changed from ${previous} to ${current}.\n`);
