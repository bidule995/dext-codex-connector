import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const bundlePath = fileURLToPath(
  new URL("../../plugin/runtime/dext-fixture-stdio.mjs", import.meta.url)
);
const expectedTools = [
  "connection_status",
  "list_capabilities",
  "search",
  "fetch",
  "list_clients",
  "get_client",
  "get_client_activity_stats",
  "summarize_portfolio_health",
  "find_client_health_risks",
  "compare_clients",
  "snapshot_health_metrics",
  "compare_health_snapshots"
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

function textContent(result: unknown): string {
  if (typeof result !== "object" || result === null) {
    throw new Error("Expected an MCP result object.");
  }
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    throw new Error("Expected MCP text content.");
  }
  const first = content[0] as { type?: unknown; text?: unknown } | undefined;
  if (!first || first.type !== "text" || typeof first.text !== "string") {
    throw new Error("Expected an MCP text result.");
  }
  return first.text;
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
  it("starts outside the checkout and serves every fixture tool under hostile live settings", async () => {
    const { client, stderr } = await connectPlugin();
    try {
      const listed = await client.listTools();
      expect(listed.tools.map(({ name }) => name)).toEqual(expectedTools);

      const status = structured(await call(client, "connection_status", {}));
      expect(status).toMatchObject({
        providerMode: "fixture",
        liveDextRequestsEnabled: false
      });
      await call(client, "list_capabilities", {});

      const search = await call(client, "search", { query: "harbor" });
      const text = textContent(search);
      const searchResult = JSON.parse(text) as {
        results: Array<{ id: string }>;
      };
      await call(client, "fetch", { id: searchResult.results[0]!.id });

      const clients = structured(await call(client, "list_clients", {}));
      expect(clients).toMatchObject({ count: 3, truncated: false });
      expect(JSON.stringify(clients)).toContain("Harbor Goods Ltd");
      await call(client, "get_client", { clientId: "fixture-harbor" });
      await call(client, "get_client_activity_stats", {
        clientId: "fixture-harbor"
      });
      await call(client, "summarize_portfolio_health", {});
      await call(client, "find_client_health_risks", {});
      await call(client, "compare_clients", {
        clientIds: ["fixture-northstar", "fixture-harbor"]
      });

      const earlier = structured(
        await call(client, "snapshot_health_metrics", {
          snapshotKey: "plugin-earlier"
        })
      );
      const later = structured(
        await call(client, "snapshot_health_metrics", {
          snapshotKey: "plugin-later"
        })
      );
      await call(client, "compare_health_snapshots", {
        earlierSnapshotId: earlier["id"],
        laterSnapshotId: later["id"]
      });
      expect(stderr()).toBe("");
    } finally {
      await client.close();
    }
  });

  it("does not persist fixture snapshots between plugin processes", async () => {
    const first = await connectPlugin();
    let snapshotId: unknown;
    try {
      snapshotId = structured(
        await call(first.client, "snapshot_health_metrics", {
          snapshotKey: "ephemeral"
        })
      )["id"];
    } finally {
      await first.client.close();
    }

    const second = await connectPlugin();
    try {
      const result = await second.client.callTool({
        name: "compare_health_snapshots",
        arguments: {
          earlierSnapshotId: snapshotId,
          laterSnapshotId: snapshotId
        }
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("was not found");
      expect(second.stderr()).toBe("");
    } finally {
      await second.client.close();
    }
  });
});
