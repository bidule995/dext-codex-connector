import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ConnectorScopes, type AuthContext } from "../auth/types.js";
import {
  CapabilitiesOutputSchema,
  ConnectionStatusOutputSchema,
  EmptyInputSchema
} from "../contracts/tool-schemas.js";
import type { AppDependencies } from "../dependencies.js";
import { executeTool, structuredResult } from "./result.js";
import { toolSecurity } from "./security.js";

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

export function registerCoreTools(
  server: McpServer,
  dependencies: AppDependencies,
  auth: AuthContext
): void {
  server.registerTool(
    "connection_status",
    {
      title: "Dext connection status",
      description:
        "Use this when you need to check which Dext modules and provider modes are enabled without reading company records.",
      inputSchema: EmptyInputSchema,
      outputSchema: ConnectionStatusOutputSchema,
      annotations: readOnlyAnnotations,
      ...toolSecurity(ConnectorScopes.ConnectorRead)
    },
    async () =>
      executeTool(
        {
          auth,
          audit: dependencies.audit,
          tool: "connection_status",
          requiredScope: ConnectorScopes.ConnectorRead,
          resourceMetadataUrl: dependencies.resourceMetadataUrl
        },
        async () =>
          structuredResult(
            await dependencies.capabilities.connectionStatus(
              auth.tenantId,
              auth.userId
            )
          )
      )
  );

  server.registerTool(
    "list_capabilities",
    {
      title: "List Dext connector capabilities",
      description:
        "Use this when you need the enabled tool inventory and the reasons unavailable Dext modules are gated.",
      inputSchema: EmptyInputSchema,
      outputSchema: CapabilitiesOutputSchema,
      annotations: readOnlyAnnotations,
      ...toolSecurity(ConnectorScopes.ConnectorRead)
    },
    async () =>
      executeTool(
        {
          auth,
          audit: dependencies.audit,
          tool: "list_capabilities",
          requiredScope: ConnectorScopes.ConnectorRead,
          resourceMetadataUrl: dependencies.resourceMetadataUrl
        },
        async () => structuredResult(dependencies.capabilities.listCapabilities())
      )
  );
}
