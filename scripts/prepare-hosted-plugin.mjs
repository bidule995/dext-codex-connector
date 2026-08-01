import { isIP } from "node:net";
import { readFile, writeFile } from "node:fs/promises";

const argumentIndex = process.argv.indexOf("--url");
const rawUrl = argumentIndex >= 0 ? process.argv[argumentIndex + 1] : undefined;
if (!rawUrl) {
  throw new Error(
    "Pass the deployed endpoint, for example --url https://connector.example.com/mcp."
  );
}
const url = new URL(rawUrl);
const hostname = url.hostname.toLocaleLowerCase();
if (
  url.protocol !== "https:" ||
  url.pathname !== "/mcp" ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  hostname === "localhost" ||
  hostname.endsWith(".localhost") ||
  isIP(hostname) !== 0 ||
  hostname.endsWith(".invalid") ||
  hostname.endsWith(".example") ||
  hostname === "example.com"
) {
  throw new Error(
    "Hosted plugin URL must be a real public HTTPS origin ending at /mcp, with no credentials, query, or fragment."
  );
}

const root = new URL("../", import.meta.url);
const manifestUrl = new URL(".codex-plugin/plugin.json", root);
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
manifest.description =
  "Authenticated read-only Dext Data Health and Commerce access through a hosted MCP connector.";
manifest.keywords = ["dext", "accounting", "invoices", "mcp", "oauth"];
manifest.interface.displayName = "Dext Connector";
manifest.interface.shortDescription = "Read connected Dext health and invoice data";
manifest.interface.longDescription =
  "Authenticated read-only tools for each user's explicitly connected Dext Data Health and optional Commerce account.";
manifest.interface.capabilities = [
  "Authenticated read-only Dext tools",
  "Data Health analysis",
  "Commerce invoice retrieval",
  "MCP"
];
manifest.interface.defaultPrompt = [
  "Check my Dext connection status and summarize available records.",
  "List recent connected Dext invoices.",
  "Find Data Health risks in my connected client portfolio."
];

await writeFile(
  new URL(".mcp.json", root),
  `${JSON.stringify({ mcpServers: { dext: { url: url.toString() } } }, null, 2)}\n`,
  "utf8"
);
await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`Prepared hosted Codex plugin for ${url.toString()}\n`);
