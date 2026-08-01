import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ConnectorScopes, type AuthContext } from "../auth/types.js";
import { FetchInputSchema, SearchInputSchema } from "../contracts/tool-schemas.js";
import type { AppDependencies } from "../dependencies.js";
import { executeTool, jsonTextResult } from "./result.js";
import { toolSecurity } from "./security.js";
import type { ToolSecurityMode } from "./security.js";

const upstreamReadAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
} as const;

export function registerRecordTools(
  server: McpServer,
  dependencies: AppDependencies,
  auth: AuthContext,
  securityMode: ToolSecurityMode = "oauth"
): void {
  const common = {
    auth,
    audit: dependencies.audit,
    requiredScope: ConnectorScopes.RecordsRead,
    resourceMetadataUrl: dependencies.resourceMetadataUrl
  } as const;

  server.registerTool(
    "search",
    {
      title: "Search Dext records",
      description:
        "Use this when you need to find records across the Dext modules connected by the current user.",
      inputSchema: SearchInputSchema,
      annotations: upstreamReadAnnotations,
      ...toolSecurity(ConnectorScopes.RecordsRead, securityMode)
    },
    async ({ query }) =>
      executeTool({ ...common, tool: "search" }, async () =>
        jsonTextResult({
          results: await dependencies.records.search(
            auth.tenantId,
            auth.userId,
            query
          )
        })
      )
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch a Dext record",
      description:
        "Use this when you have a Dext connector record ID and need its complete searchable text and metadata.",
      inputSchema: FetchInputSchema,
      annotations: upstreamReadAnnotations,
      ...toolSecurity(ConnectorScopes.RecordsRead, securityMode)
    },
    async ({ id }) =>
      executeTool(
        { ...common, tool: "fetch", targetIds: [id] },
        async () =>
          jsonTextResult(
            await dependencies.records.fetchRecord(
              auth.tenantId,
              auth.userId,
              id
            )
          )
      )
  );
}
