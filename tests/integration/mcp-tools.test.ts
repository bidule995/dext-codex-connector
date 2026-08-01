import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { AllDevelopmentScopes } from "../../src/auth/types.js";
import { createDependencies } from "../../src/dependencies.js";
import { createMcpServer } from "../../src/mcp/create-server.js";
import type { InMemoryAuditSink } from "../../src/storage/repositories.js";
import { fixtureConfig } from "../helpers/config.js";

function textFrom(result: unknown): string {
  if (typeof result !== "object" || result === null) {
    throw new Error("Expected a completed tool result.");
  }
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    throw new Error("Expected tool result content.");
  }
  const first = content[0] as { type?: unknown; text?: unknown } | undefined;
  if (!first || first.type !== "text" || typeof first.text !== "string") {
    throw new Error("Expected a text tool result.");
  }
  return first.text;
}

async function createConnectedClient() {
  const dependencies = createDependencies(fixtureConfig());
  const server = createMcpServer(dependencies, {
    tenantId: "test-tenant",
    userId: "test-user",
    scopes: AllDevelopmentScopes,
    mode: "development"
  });
  const client = new Client({ name: "connector-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server, dependencies };
}

describe("MCP tool surface", () => {
  it("registers the approved Data Health surface and keeps gated modules absent", async () => {
    const { client, server } = await createConnectedClient();
    try {
      const listed = await client.listTools();
      const names = listed.tools.map(({ name }) => name);
      expect(names).toEqual([
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
      ]);
      expect(names.some((name) => name.includes("commerce"))).toBe(false);
      expect(names.some((name) => name.includes("prepare"))).toBe(false);
      expect(
        listed.tools.every(({ description }) =>
          description?.startsWith("Use this when")
        )
      ).toBe(true);
      expect(
        listed.tools.every(
          (tool) =>
            Array.isArray(tool._meta?.["securitySchemes"]) &&
            tool._meta["securitySchemes"].length === 1
        )
      ).toBe(true);
      expect(
        listed.tools
          .filter(({ name }) => name !== "search" && name !== "fetch")
          .every(({ outputSchema }) => outputSchema?.type === "object")
      ).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("implements the exact text-only search and fetch response shape", async () => {
    const { client, server } = await createConnectedClient();
    try {
      const search = await client.callTool({
        name: "search",
        arguments: { query: "harbor" }
      });
      expect("structuredContent" in search).toBe(false);
      const searchPayload = JSON.parse(textFrom(search)) as {
        results: Array<{ id: string; title: string; url: string }>;
      };
      expect(searchPayload.results).toHaveLength(1);
      expect(searchPayload.results[0]).toMatchObject({
        id: "dext:health:client:fixture-harbor",
        title: "Harbor Goods Ltd"
      });

      const fetchResult = await client.callTool({
        name: "fetch",
        arguments: { id: searchPayload.results[0]!.id }
      });
      expect("structuredContent" in fetchResult).toBe(false);
      const record = JSON.parse(textFrom(fetchResult)) as {
        id: string;
        title: string;
        text: string;
        url: string;
        metadata: Record<string, unknown>;
      };
      expect(record).toMatchObject({
        id: "dext:health:client:fixture-harbor",
        title: "Harbor Goods Ltd",
        metadata: {
          clientId: "fixture-harbor",
          providerMode: "fixture"
        }
      });
      expect(record.text).toContain("Health score: 57");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns structured direct-tool results and records payload-free audits", async () => {
    const { client, server, dependencies } = await createConnectedClient();
    try {
      const result = await client.callTool({
        name: "get_client",
        arguments: { clientId: "fixture-northstar" }
      });
      expect("structuredContent" in result && result.structuredContent).toMatchObject(
        {
          client: { id: "fixture-northstar" }
        }
      );
      const audit = dependencies.audit as InMemoryAuditSink;
      expect(audit.events).toHaveLength(1);
      expect(audit.events[0]).toMatchObject({
        tenantId: "test-tenant",
        userId: "test-user",
        tool: "get_client",
        outcome: "success",
        targetIds: ["fixture-northstar"]
      });
      expect(JSON.stringify(audit.events[0])).not.toContain(
        "Northstar Studio Ltd"
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
});
