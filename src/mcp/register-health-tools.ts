import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ConnectorScopes, type AuthContext } from "../auth/types.js";
import {
  ClientIdInputSchema,
  ClientActivityOutputSchema,
  CompareClientsInputSchema,
  CompareClientsOutputSchema,
  CompareSnapshotsInputSchema,
  CompareSnapshotsOutputSchema,
  FindHealthRisksInputSchema,
  GetClientOutputSchema,
  ListClientsInputSchema,
  ListClientsOutputSchema,
  PortfolioOutputSchema,
  RiskOutputSchema,
  SnapshotHealthInputSchema,
  SnapshotOutputSchema,
  SummarizePortfolioInputSchema
} from "../contracts/tool-schemas.js";
import type { AppDependencies } from "../dependencies.js";
import { executeTool, structuredResult } from "./result.js";
import { toolSecurity } from "./security.js";

const upstreamReadAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
} as const;

const snapshotAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

export function registerHealthTools(
  server: McpServer,
  dependencies: AppDependencies,
  auth: AuthContext
): void {
  const common = {
    auth,
    audit: dependencies.audit,
    requiredScope: ConnectorScopes.HealthRead,
    resourceMetadataUrl: dependencies.resourceMetadataUrl
  } as const;

  server.registerTool(
    "list_clients",
    {
      title: "List Dext Data Health clients",
      description:
        "Use this when you need a bounded, filterable list of clients visible to the current Dext connection.",
      inputSchema: ListClientsInputSchema,
      outputSchema: ListClientsOutputSchema,
      annotations: upstreamReadAnnotations,
      ...toolSecurity(ConnectorScopes.HealthRead)
    },
    async ({ query, alertLevels, limit }) =>
      executeTool(
        { ...common, tool: "list_clients" },
        async () =>
          structuredResult(
            await dependencies.health.listClients(auth.tenantId, auth.userId, {
              limit,
              ...(query === undefined ? {} : { query }),
              ...(alertLevels === undefined ? {} : { alertLevels })
            })
          )
      )
  );

  server.registerTool(
    "get_client",
    {
      title: "Get a Dext Data Health client",
      description:
        "Use this when you need the detailed Data Health profile for one known Dext client ID.",
      inputSchema: ClientIdInputSchema,
      outputSchema: GetClientOutputSchema,
      annotations: upstreamReadAnnotations,
      ...toolSecurity(ConnectorScopes.HealthRead)
    },
    async ({ clientId }) =>
      executeTool(
        { ...common, tool: "get_client", targetIds: [clientId] },
        async () =>
          structuredResult(
            await dependencies.health.getClient(
              auth.tenantId,
              auth.userId,
              clientId
            )
          )
      )
  );

  server.registerTool(
    "get_client_activity_stats",
    {
      title: "Get Dext client activity",
      description:
        "Use this when you need annual, monthly-average, and quarterly-average activity statistics for one Dext client.",
      inputSchema: ClientIdInputSchema,
      outputSchema: ClientActivityOutputSchema,
      annotations: upstreamReadAnnotations,
      ...toolSecurity(ConnectorScopes.HealthRead)
    },
    async ({ clientId }) =>
      executeTool(
        {
          ...common,
          tool: "get_client_activity_stats",
          targetIds: [clientId]
        },
        async () =>
          structuredResult(
            await dependencies.health.getClientActivityStats(
              auth.tenantId,
              auth.userId,
              clientId
            )
          )
      )
  );

  server.registerTool(
    "summarize_portfolio_health",
    {
      title: "Summarize Dext portfolio health",
      description:
        "Use this when you need aggregate Data Health counts and scores across the connected client portfolio.",
      inputSchema: SummarizePortfolioInputSchema,
      outputSchema: PortfolioOutputSchema,
      annotations: upstreamReadAnnotations,
      ...toolSecurity(ConnectorScopes.HealthRead)
    },
    async ({ alertLevels, healthScoreBelow }) =>
      executeTool(
        { ...common, tool: "summarize_portfolio_health" },
        async () =>
          structuredResult(
            await dependencies.health.summarizePortfolio(
              auth.tenantId,
              auth.userId,
              {
              ...(alertLevels === undefined ? {} : { alertLevels }),
              ...(healthScoreBelow === undefined ? {} : { healthScoreBelow })
              }
            ),
            "Returned aggregate portfolio health with a bounded client sample."
          )
      )
  );

  server.registerTool(
    "find_client_health_risks",
    {
      title: "Find Dext client health risks",
      description:
        "Use this when you need clients matching explicit Data Health, debtor, HMRC, or manual-feed risk thresholds.",
      inputSchema: FindHealthRisksInputSchema,
      outputSchema: RiskOutputSchema,
      annotations: upstreamReadAnnotations,
      ...toolSecurity(ConnectorScopes.HealthRead)
    },
    async (input) =>
      executeTool(
        { ...common, tool: "find_client_health_risks" },
        async () =>
          structuredResult(
            await dependencies.health.findRisks(auth.tenantId, auth.userId, {
              healthScoreAtOrBelow: input.healthScoreAtOrBelow,
              requireHmrcConnected: input.requireHmrcConnected,
              limit: input.limit,
              ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
              ...(input.alertLevels === undefined
                ? {}
                : { alertLevels: input.alertLevels }),
              ...(input.averageDebtorDaysAtOrAbove === undefined
                ? {}
                : {
                    averageDebtorDaysAtOrAbove:
                      input.averageDebtorDaysAtOrAbove
                  }),
              ...(input.debtorBalanceAtOrAbove === undefined
                ? {}
                : { debtorBalanceAtOrAbove: input.debtorBalanceAtOrAbove }),
              ...(input.manualFeedsAtOrAbove === undefined
                ? {}
                : { manualFeedsAtOrAbove: input.manualFeedsAtOrAbove })
            })
          )
      )
  );

  server.registerTool(
    "compare_clients",
    {
      title: "Compare Dext clients",
      description:
        "Use this when you need a side-by-side Data Health and activity comparison for two or more known client IDs.",
      inputSchema: CompareClientsInputSchema,
      outputSchema: CompareClientsOutputSchema,
      annotations: upstreamReadAnnotations,
      ...toolSecurity(ConnectorScopes.HealthRead)
    },
    async ({ clientIds }) =>
      executeTool(
        { ...common, tool: "compare_clients", targetIds: clientIds },
        async () =>
          structuredResult(
            await dependencies.health.compareClients(
              auth.tenantId,
              auth.userId,
              clientIds
            )
          )
      )
  );

  server.registerTool(
    "snapshot_health_metrics",
    {
      title: "Snapshot Dext health metrics",
      description:
        "Use this when you need a tenant-scoped connector snapshot for later comparison; this does not modify Dext.",
      inputSchema: SnapshotHealthInputSchema,
      outputSchema: SnapshotOutputSchema,
      annotations: snapshotAnnotations,
      ...toolSecurity(ConnectorScopes.HealthSnapshotsWrite)
    },
    async ({ snapshotKey }) =>
      executeTool(
        {
          auth,
          audit: dependencies.audit,
          tool: "snapshot_health_metrics",
          requiredScope: ConnectorScopes.HealthSnapshotsWrite,
          resourceMetadataUrl: dependencies.resourceMetadataUrl
        },
        async () =>
          structuredResult(
            await dependencies.health.takeSnapshot(
              auth.tenantId,
              auth.userId,
              snapshotKey
            )
          )
      )
  );

  server.registerTool(
    "compare_health_snapshots",
    {
      title: "Compare Dext health snapshots",
      description:
        "Use this when you need added, removed, or health-changed clients between two connector snapshots.",
      inputSchema: CompareSnapshotsInputSchema,
      outputSchema: CompareSnapshotsOutputSchema,
      annotations: upstreamReadAnnotations,
      ...toolSecurity(ConnectorScopes.HealthRead)
    },
    async ({ earlierSnapshotId, laterSnapshotId }) =>
      executeTool(
        {
          ...common,
          tool: "compare_health_snapshots",
          targetIds: [earlierSnapshotId, laterSnapshotId]
        },
        async () =>
          structuredResult(
            await dependencies.health.compareSnapshots(
              auth.tenantId,
              auth.userId,
              earlierSnapshotId,
              laterSnapshotId
            )
          )
      )
  );
}
