import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { ConnectorScopes } from "../../src/auth/types.js";
import { createDependencies } from "../../src/dependencies.js";
import { createMcpServer } from "../../src/mcp/create-server.js";
import { fixtureConfig } from "../helpers/config.js";

describe("tool authorization", () => {
  it("returns an upscoping challenge before a health provider call", async () => {
    const dependencies = createDependencies(fixtureConfig());
    const server = createMcpServer(dependencies, {
      tenantId: "test-tenant",
      userId: "limited-user",
      scopes: new Set([ConnectorScopes.ConnectorRead]),
      mode: "development"
    });
    const client = new Client({ name: "scope-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const result = await client.callTool({
        name: "list_clients",
        arguments: { limit: 1 }
      });
      expect("isError" in result && result.isError).toBe(true);
      const meta = "_meta" in result ? result._meta : undefined;
      const challengeValue: unknown = meta?.["mcp/www_authenticate"];
      expect(Array.isArray(challengeValue)).toBe(true);
      if (!Array.isArray(challengeValue)) {
        throw new Error("Expected an authentication challenge array.");
      }
      const challenge: unknown = challengeValue[0];
      if (typeof challenge !== "string") {
        throw new Error("Expected an authentication challenge string.");
      }
      expect(challenge).toContain(
        'resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"'
      );
      expect(challenge).toContain('scope="health.read"');
      expect(challenge).toContain('error="insufficient_scope"');
      expect(challenge).toContain("error_description=");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
