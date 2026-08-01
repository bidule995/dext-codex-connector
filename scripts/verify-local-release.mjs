import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const [manifest, mcp, bundle] = await Promise.all([
  readJson(".codex-plugin/plugin.json"),
  readJson(".mcp.json"),
  readFile(new URL("plugin/runtime/dext-local-stdio.mjs", root), "utf8")
]);
const server = mcp.mcpServers?.dext;
assert(server?.command === "node", "Local release must launch Node.js.");
assert(server?.cwd === ".", "Local release must use the plugin root.");
assert(
  JSON.stringify(server?.args) ===
    JSON.stringify(["./plugin/runtime/dext-local-stdio.mjs"]),
  "Local release points at the wrong stdio bundle."
);
assert(server.url === undefined, "Local release must not use a hosted MCP URL.");
assert(server.env === undefined, "Local release must not embed environment values.");
for (const name of [
  "DEXT_CONNECTOR_MODE",
  "DEXT_DATA_HEALTH_TOKEN",
  "DEXT_COMMERCE_API_KEY"
]) {
  assert(server.env_vars?.includes(name), `Local release must forward ${name}.`);
}
assert(
  !JSON.stringify(manifest).toLocaleLowerCase().includes("fixture"),
  "Local live manifest must not advertise fixture behavior."
);
for (const forbidden of [
  "Northstar Studio Ltd",
  "Harbor Goods Ltd",
  "Orchard Labs Ltd",
  "PostgresRepositories",
  "AesGcmEnvelopeCredentialDecryptor",
  "createFastify",
  "@fastify/rate-limit"
]) {
  assert(
    !bundle.includes(forbidden),
    `Local bundle contains forbidden hosted or fixture token: ${forbidden}`
  );
}
for (const required of [
  "api.precision.dext.com",
  "sandbox-api.greenback.com",
  "api.greenback.com",
  "windows-dpapi-current-user",
  'type: "noauth"'
]) {
  assert(bundle.includes(required), `Local bundle is missing ${required}.`);
}
await Promise.all(
  [
    "scripts/configure-local.ps1",
    "scripts/show-local-status.ps1",
    "scripts/remove-local-credentials.ps1",
    "docs/local-setup.md"
  ].map((path) => access(new URL(path, root)))
);
process.stdout.write("Local live Codex plugin release checks passed.\n");
