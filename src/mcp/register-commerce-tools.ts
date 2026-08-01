import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ConnectorScopes, type AuthContext } from "../auth/types.js";
import {
  GetInvoiceInputSchema,
  GetInvoiceOutputSchema,
  ListInvoicesInputSchema,
  ListInvoicesOutputSchema
} from "../contracts/tool-schemas.js";
import type { AppDependencies } from "../dependencies.js";
import { executeTool, structuredResult } from "./result.js";
import { toolSecurity } from "./security.js";
import type { ToolSecurityMode } from "./security.js";

const upstreamReadAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
} as const;

export function registerCommerceTools(
  server: McpServer,
  dependencies: AppDependencies,
  auth: AuthContext,
  securityMode: ToolSecurityMode = "oauth"
): void {
  const commerce = dependencies.commerce;
  if (!commerce) return;
  const common = {
    auth,
    audit: dependencies.audit,
    requiredScope: ConnectorScopes.CommerceRead,
    resourceMetadataUrl: dependencies.resourceMetadataUrl
  } as const;

  server.registerTool(
    "list_invoices",
    {
      title: "List Dext Commerce invoices",
      description:
        "Use this when you need a bounded page of sales invoices or purchase bills from the current user's Dext Commerce connection.",
      inputSchema: ListInvoicesInputSchema,
      outputSchema: ListInvoicesOutputSchema,
      annotations: upstreamReadAnnotations,
      ...toolSecurity(ConnectorScopes.CommerceRead, securityMode)
    },
    async (input) =>
      executeTool({ ...common, tool: "list_invoices" }, async () =>
        structuredResult(
          await commerce.listInvoices(auth.tenantId, auth.userId, {
            direction: input.direction,
            limit: input.limit,
            ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
            ...(input.query === undefined ? {} : { query: input.query }),
            ...(input.accountIds === undefined
              ? {}
              : { accountIds: input.accountIds }),
            ...(input.minTransactedAt === undefined
              ? {}
              : { minTransactedAt: input.minTransactedAt }),
            ...(input.maxTransactedAt === undefined
              ? {}
              : { maxTransactedAt: input.maxTransactedAt })
          })
        )
      )
  );

  server.registerTool(
    "get_invoice",
    {
      title: "Get a Dext Commerce invoice",
      description:
        "Use this when you need the normalized details of one known Dext Commerce invoice or bill transaction.",
      inputSchema: GetInvoiceInputSchema,
      outputSchema: GetInvoiceOutputSchema,
      annotations: upstreamReadAnnotations,
      ...toolSecurity(ConnectorScopes.CommerceRead, securityMode)
    },
    async ({ transactionId }) =>
      executeTool(
        { ...common, tool: "get_invoice", targetIds: [transactionId] },
        async () =>
          structuredResult(
            await commerce.getInvoice(
              auth.tenantId,
              auth.userId,
              transactionId
            )
          )
      )
  );
}
