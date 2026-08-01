import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const [packageJson, manifest, mcp, marketplace, sourceVersion, bundle] =
  await Promise.all([
    readJson("package.json"),
    readJson(".codex-plugin/plugin.json"),
    readJson(".mcp.json"),
    readJson(".agents/plugins/marketplace.json"),
    readFile(new URL("src/version.ts", root), "utf8"),
    readFile(new URL("plugin/runtime/dext-local-stdio.mjs", root), "utf8")
  ]);

const semver =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
assert(semver.test(manifest.version), "Plugin version must be strict semver.");
assert(manifest.name === "dext-codex-connector", "Unexpected plugin name.");
assert(
  manifest.version === packageJson.version,
  "Package and plugin versions differ."
);
assert(
  sourceVersion.includes(`CONNECTOR_VERSION = "${manifest.version}"`),
  "Source and plugin versions differ."
);
assert(manifest.mcpServers === "./.mcp.json", "Plugin must reference .mcp.json.");
assert(
  ["Dext Data Health", "Dext Connector"].includes(
    manifest.interface?.displayName
  ),
  "Missing display name."
);
assert(manifest.interface?.category === "Productivity", "Unexpected category.");
assert(manifest.interface?.brandColor === "#176B87", "Unexpected brand color.");
assert(
  Array.isArray(manifest.interface?.capabilities) &&
    manifest.interface.capabilities.length > 0,
  "Plugin capabilities are required."
);
assert(
  Array.isArray(manifest.interface?.defaultPrompt) &&
    manifest.interface.defaultPrompt.length > 0 &&
    manifest.interface.defaultPrompt.length <= 3 &&
    manifest.interface.defaultPrompt.every(
      (prompt) => typeof prompt === "string" && prompt.length <= 128
    ),
  "Plugin starter prompts must contain one to three entries of at most 128 characters."
);
assert(
  !JSON.stringify(manifest).toLocaleLowerCase().includes("fixture"),
  "Local live plugin manifest still advertises fixture behavior."
);

for (const asset of [manifest.interface.composerIcon, manifest.interface.logo]) {
  assert(
    typeof asset === "string" && asset.startsWith("./assets/"),
    "Invalid asset path."
  );
  await access(new URL(asset.slice(2), root));
}

const server = mcp.mcpServers?.dext;
assert(server?.cwd === ".", "Dext MCP server must run from the plugin root.");
assert(server?.command === "node", "Dext MCP server must use Node.js.");
assert(
  JSON.stringify(server?.args) ===
    JSON.stringify(["./plugin/runtime/dext-local-stdio.mjs"]),
  "Unexpected Dext MCP server arguments."
);
assert(server.url === undefined, "Local plugin must not use a hosted URL.");
assert(server.env === undefined, "Local plugin must not inject secret values.");
assert(Array.isArray(server.env_vars), "Local plugin must declare env_vars.");
for (const name of [
  "DEXT_CONNECTOR_MODE",
  "DEXT_LOCAL_CONFIG_PATH",
  "DEXT_DATA_HEALTH_TOKEN",
  "DEXT_COMMERCE_API_KEY"
]) {
  assert(server.env_vars.includes(name), `Missing forwarded variable ${name}.`);
}

assert(marketplace.name === "dext-codex-connector", "Unexpected marketplace name.");
assert(
  marketplace.plugins?.length === 1,
  "Marketplace must expose exactly one plugin."
);
const entry = marketplace.plugins[0];
assert(entry.name === manifest.name, "Marketplace and plugin names differ.");
assert(
  entry.source?.source === "local" && entry.source?.path === "./",
  "Marketplace must point at the repository-root plugin."
);
assert(entry.policy?.installation === "AVAILABLE", "Unexpected installation policy.");
assert(entry.policy?.authentication === "ON_INSTALL", "Unexpected authentication policy.");
assert(entry.category === "Productivity", "Unexpected marketplace category.");

await access(new URL(".app.json", root)).then(
  () => {
    throw new Error(".app.json must not exist before an official connector ID is assigned.");
  },
  () => undefined
);

for (const forbidden of [
  "Northstar Studio Ltd",
  "Harbor Goods Ltd",
  "Orchard Labs Ltd",
  "DATABASE_URL",
  "CREDENTIAL_MASTER_KEY",
  "PostgresRepositories",
  "AesGcmEnvelopeCredentialDecryptor",
  "@fastify/rate-limit"
]) {
  assert(
    !bundle.includes(forbidden),
    `Local plugin bundle contains forbidden token: ${forbidden}`
  );
}
for (const required of [
  "api.precision.dext.com",
  "sandbox-api.greenback.com",
  "windows-dpapi-current-user",
  "providerMode"
]) {
  assert(bundle.includes(required), `Local plugin bundle is missing ${required}.`);
}

process.stdout.write(
  `Codex plugin ${manifest.name}@${manifest.version} validated in local live mode.\n`
);
