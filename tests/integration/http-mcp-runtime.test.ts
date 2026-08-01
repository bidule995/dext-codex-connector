import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import { fixtureConfig } from "../helpers/config.js";

describe("Streamable HTTP MCP runtime", () => {
  it("initializes, lists tools, and calls a fixture tool over a real local socket", async () => {
    const app = buildApp(fixtureConfig());
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const client = new Client({ name: "http-smoke-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL("/mcp", address),
      {
        requestInit: {
          headers: {
            authorization: "Bearer local-dev-token-change-me"
          }
        }
      }
    );

    try {
      // SDK 1.30 types predate exactOptionalPropertyTypes compatibility.
      await client.connect(transport as unknown as Transport);
      const listed = await client.listTools();
      expect(listed.tools.map(({ name }) => name)).toContain("list_clients");

      const result = await client.callTool({
        name: "list_clients",
        arguments: { limit: 2 }
      });
      expect("structuredContent" in result && result.structuredContent).toMatchObject(
        {
          count: 3,
          truncated: true
        }
      );
    } finally {
      await client.close();
      await app.close();
    }
  });
});
