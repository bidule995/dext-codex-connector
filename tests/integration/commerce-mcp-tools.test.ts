import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { AllDevelopmentScopes } from "../../src/auth/types.js";
import type { DextCommerceProviderResolver } from "../../src/connections/commerce-provider-resolver.js";
import { createDependencies } from "../../src/dependencies.js";
import { createMcpServer } from "../../src/mcp/create-server.js";
import type {
  DextCommerceProvider,
  ListCommerceInvoicesOptions
} from "../../src/providers/dext-commerce/provider.js";
import { CommerceService } from "../../src/services/commerce-service.js";
import { RecordService } from "../../src/services/record-service.js";
import { fixtureConfig } from "../helpers/config.js";

const invoice = {
  id: "invoice-test",
  type: "invoice",
  reference_id: "INV-100",
  account_id: "account-test",
  currency_code: "gbp",
  transacted_at: "2026-07-31T12:00:00.000Z",
  totals: { grand: 250 },
  items: [{ name: "Consulting", amount: 250 }]
};

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

class CommerceFixtureProvider implements DextCommerceProvider {
  readonly mode = "live" as const;

  async validateCredential(): Promise<void> {}

  async listInvoices(options: ListCommerceInvoicesOptions) {
    void options;
    return { transactions: [invoice], count: 1, totalCount: 1 };
  }

  async getInvoice() {
    return invoice;
  }
}

describe("Commerce MCP tools", () => {
  it("registers read-only invoice tools and unifies standard search/fetch", async () => {
    const dependencies = createDependencies(fixtureConfig());
    const resolver: DextCommerceProviderResolver = {
      resolve: async () => ({
        connectionId: "commerce-connection-test",
        provider: new CommerceFixtureProvider()
      })
    };
    dependencies.commerce = new CommerceService(
      resolver,
      dependencies.permalinks,
      () => new Date("2026-08-01T10:00:00.000Z")
    );
    dependencies.records = new RecordService(
      dependencies.health,
      dependencies.commerce
    );
    const server = createMcpServer(dependencies, {
      tenantId: "tenant-test",
      userId: "user-test",
      scopes: AllDevelopmentScopes,
      mode: "development"
    });
    const client = new Client({ name: "commerce-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const tools = await client.listTools();
      const listInvoices = tools.tools.find(({ name }) => name === "list_invoices");
      expect(listInvoices?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true
      });
      expect(tools.tools.map(({ name }) => name)).toContain("get_invoice");

      const list = await client.callTool({
        name: "list_invoices",
        arguments: { direction: "sales", limit: 10 }
      });
      expect("structuredContent" in list && list.structuredContent).toMatchObject({
        transactions: [{ id: "invoice-test", type: "invoice" }],
        count: 1
      });

      const search = await client.callTool({
        name: "search",
        arguments: { query: "INV-100" }
      });
      const searchText = textFrom(search);
      const resultId = (
        JSON.parse(searchText) as { results: Array<{ id: string }> }
      ).results[0]!.id;
      expect(resultId).toBe("dext:commerce:invoice:invoice-test");

      const fetched = await client.callTool({
        name: "fetch",
        arguments: { id: resultId }
      });
      const fetchText = textFrom(fetched);
      expect(JSON.parse(fetchText)).toMatchObject({
        id: resultId,
        title: "Invoice INV-100",
        metadata: { module: "commerce", direction: "sales" }
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
