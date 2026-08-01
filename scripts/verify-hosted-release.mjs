import { isIP } from "node:net";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [mcp, manifest, source, migration] = await Promise.all([
  readFile(new URL(".mcp.json", root), "utf8").then(JSON.parse),
  readFile(new URL(".codex-plugin/plugin.json", root), "utf8").then(JSON.parse),
  readFile(new URL("src/config.ts", root), "utf8"),
  readFile(new URL("migrations/0003_user_owned_connections.sql", root), "utf8")
]);
const server = mcp.mcpServers?.dext;
if (!server || typeof server.url !== "string") {
  throw new Error(
    "Live releases require .mcp.json to contain a hosted dext.url; run plugin:prepare-hosted after deployment."
  );
}
const url = new URL(server.url);
const hostname = url.hostname.toLocaleLowerCase();
if (
  url.protocol !== "https:" ||
  url.pathname !== "/mcp" ||
  url.search ||
  url.hash ||
  url.username ||
  url.password ||
  hostname === "localhost" ||
  hostname.endsWith(".localhost") ||
  hostname.endsWith(".invalid") ||
  hostname.endsWith(".example") ||
  hostname === "example.com" ||
  isIP(hostname) !== 0
) {
  throw new Error("Live release MCP URL is not a real public HTTPS /mcp endpoint.");
}
if (server.command || server.args || server.cwd || server.env) {
  throw new Error("Live release must not include a stdio fixture fallback.");
}
if (JSON.stringify(manifest).toLocaleLowerCase().includes("fixture")) {
  throw new Error("Live release manifest still advertises fixture behavior.");
}
if (!source.includes("fixture fallback is forbidden")) {
  throw new Error("Production configuration no longer proves fixture fail-closure.");
}
if (!migration.includes("owner_user_id = current_connector_user()")) {
  throw new Error("User-owned connection RLS migration is missing.");
}
if (process.argv.includes("--network")) {
  const healthResponse = await fetch(new URL("/healthz", url), {
    signal: AbortSignal.timeout(15_000)
  });
  if (!healthResponse.ok) {
    throw new Error(`Hosted health check failed with ${healthResponse.status}.`);
  }
  const health = await healthResponse.json();
  if (
    health?.providerMode !== "live" ||
    health?.liveDextRequestsEnabled !== true
  ) {
    throw new Error("Hosted service is not running in fail-closed live mode.");
  }
  const metadataUrl = new URL(
    "/.well-known/oauth-protected-resource",
    url
  );
  const metadataResponse = await fetch(metadataUrl, {
    signal: AbortSignal.timeout(15_000)
  });
  if (!metadataResponse.ok) {
    throw new Error(
      `Hosted protected-resource metadata failed with ${metadataResponse.status}.`
    );
  }
  const metadata = await metadataResponse.json();
  if (
    metadata?.resource !== url.toString() ||
    !Array.isArray(metadata?.authorization_servers) ||
    metadata.authorization_servers.length === 0
  ) {
    throw new Error("Hosted protected-resource metadata is incomplete.");
  }
  const unauthorized = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "release-auth-check",
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "release-check", version: "1.0.0" }
      }
    }),
    signal: AbortSignal.timeout(15_000)
  });
  if (
    unauthorized.status !== 401 ||
    !unauthorized.headers.get("www-authenticate")?.includes(
      "oauth-protected-resource"
    )
  ) {
    throw new Error("Hosted MCP endpoint did not enforce OAuth discovery.");
  }
}
process.stdout.write(`Hosted release endpoint verified: ${url.toString()}\n`);
