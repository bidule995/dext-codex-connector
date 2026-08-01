import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

import { createMcpServer } from "../../src/mcp/create-server.js";
import { createPluginLocalDependencies } from "../../src/plugin/local-dependencies.js";

const clientSummary = {
  id: "synthetic-client",
  name: "Synthetic Test Client Ltd",
  practiceCode: "SYNTHETIC",
  providerId: "synthetic-provider",
  healthScore: 72,
  alertLevel: "AMBER"
};

function structured(result: unknown): Record<string, unknown> {
  if (typeof result !== "object" || result === null) {
    throw new Error("Expected an MCP result object.");
  }
  const content = (result as { structuredContent?: unknown })
    .structuredContent;
  if (typeof content !== "object" || content === null) {
    throw new Error("Expected structured MCP content.");
  }
  return content as Record<string, unknown>;
}

describe("local live plugin runtime", () => {
  it("registers Data Health tools with noauth and reads only through injected fetch", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      );
      expect(url.origin).toBe("https://api.precision.dext.com");
      expect(url.pathname).toBe("/clients");
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer synthetic-health-token"
      );
      return new Response(JSON.stringify([clientSummary]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const runtime = await createPluginLocalDependencies({
      environment: {
        DEXT_CONNECTOR_MODE: "live",
        DEXT_DATA_HEALTH_TOKEN: "synthetic-health-token",
        DEXT_COMMERCE_ENABLED: "false"
      },
      platform: "linux",
      fetchImplementation
    });
    const server = createMcpServer(runtime.dependencies, runtime.auth, {
      runtime: "local",
      securityMode: "noauth"
    });
    const client = new Client({ name: "local-runtime-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const listed = await client.listTools();
      expect(listed.tools.map(({ name }) => name)).toEqual([
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
      expect(
        listed.tools.every(
          (tool) =>
            JSON.stringify(tool._meta?.["securitySchemes"]) ===
            JSON.stringify([{ type: "noauth" }])
        )
      ).toBe(true);

      const status = structured(
        await client.callTool({ name: "connection_status", arguments: {} })
      );
      expect(status).toMatchObject({
        providerMode: "live",
        liveDextRequestsEnabled: true,
        modules: {
          dataHealth: {
            configured: true,
            enabled: true,
            connected: true,
            credentialSource: "environment"
          }
        }
      });
      expect(fetchImplementation).not.toHaveBeenCalled();
      expect(JSON.stringify(status)).not.toContain("synthetic-health-token");

      const clients = structured(
        await client.callTool({
          name: "list_clients",
          arguments: { limit: 10 }
        })
      );
      expect(clients).toMatchObject({
        count: 1,
        clients: [{ id: "synthetic-client", name: "Synthetic Test Client Ltd" }]
      });
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
