import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const bundlePath = fileURLToPath(
  new URL("../../plugin/runtime/dext-local-stdio.mjs", import.meta.url)
);
const expectedTools = [
  "connection_status",
  "list_capabilities"
];

function hostileEnvironment(): Record<string, string> {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
  return {
    ...inherited,
    NODE_ENV: "production",
    DEXT_DATA_SOURCE: "live",
    DEXT_LIVE_REQUESTS_ENABLED: "true",
    DATABASE_URL: "postgres://company-account.invalid/never-connect",
    CREDENTIAL_MASTER_KEY: "must-never-be-read",
    CURSOR_ENCRYPTION_KEY: "must-never-be-read",
    DEXT_API_TOKEN: "must-never-be-read"
  };
}

async function connectPlugin() {
  const cwd = await mkdtemp(join(tmpdir(), "dext-plugin-cwd-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bundlePath],
    cwd,
    env: hostileEnvironment(),
    stderr: "pipe"
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const client = new Client({ name: "dext-plugin-test", version: "1.0.0" });
  await client.connect(transport);
  return { client, transport, stderr: () => stderr };
}

function structured(result: unknown): Record<string, unknown> {
  if (typeof result !== "object" || result === null) {
    throw new Error("Expected an MCP result object.");
  }
  const content = (result as { structuredContent?: unknown }).structuredContent;
  if (typeof content !== "object" || content === null) {
    throw new Error("Expected structured MCP content.");
  }
  return content as Record<string, unknown>;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>
) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).not.toBe(true);
  return result;
}

describe("committed Codex plugin stdio bundle", () => {
  it("starts outside the checkout, defaults disabled, and ignores legacy hosted secrets", async () => {
    const { client, stderr } = await connectPlugin();
    try {
      const listed = await client.listTools();
      expect(listed.tools.map(({ name }) => name)).toEqual(expectedTools);
      expect(
        listed.tools.every(
          (tool) =>
            JSON.stringify(tool._meta?.["securitySchemes"]) ===
            JSON.stringify([{ type: "noauth" }])
        )
      ).toBe(true);

      const status = structured(await call(client, "connection_status", {}));
      expect(status).toMatchObject({
        providerMode: "disabled",
        liveDextRequestsEnabled: false
      });
      const capabilities = structured(
        await call(client, "list_capabilities", {})
      );
      expect(capabilities).toMatchObject({ enabledTools: expectedTools });
      expect(JSON.stringify(status)).not.toContain("must-never-be-read");
      expect(JSON.stringify(capabilities)).not.toContain("must-never-be-read");
      expect(stderr()).toContain("local MCP started in disabled mode");
    } finally {
      await client.close();
    }
  });
});
