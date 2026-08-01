import {
  publicConnection,
  type ConnectionService
} from "../connections/connection-service.js";
import { CommerceEndpointCatalog } from "../providers/dext-commerce/catalog.js";
import { PrepareModuleStatus } from "../providers/dext-prepare/status.js";
import type { CommerceService } from "./commerce-service.js";
import type { HealthService } from "./health-service.js";

export interface CapabilityConfig {
  liveDextRequestsEnabled: boolean;
  commerceEnabled: boolean;
}

export class CapabilityService {
  constructor(
    private readonly config: CapabilityConfig,
    private readonly health: HealthService,
    private readonly commerce?: CommerceService,
    private readonly connections?: ConnectionService
  ) {}

  async connectionStatus(
    tenantId: string,
    userId: string
  ): Promise<Record<string, unknown>> {
    const connections = this.connections
      ? await this.connections.list(tenantId, userId)
      : [];
    const activeModules = new Set(
      connections
        .filter(({ state }) => state === "active")
        .map(({ module }) => module)
    );
    const fixtureHealth = this.health.providerMode === "fixture";
    const liveHealth =
      this.health.providerMode === "live" && activeModules.has("data_health");
    const commerceConnected =
      this.commerce !== undefined && activeModules.has("commerce");
    return {
      providerMode: this.health.providerMode,
      liveDextRequestsEnabled: this.config.liveDextRequestsEnabled,
      connections: connections.map(publicConnection),
      modules: {
        dataHealth: {
          enabled: fixtureHealth || liveHealth,
          connected: fixtureHealth || liveHealth,
          mode: this.health.providerMode,
          endpointContracts: 3
        },
        commerce: {
          enabled: this.commerce !== undefined,
          connected: commerceConnected,
          endpointContracts: CommerceEndpointCatalog.length,
          ...(!this.config.commerceEnabled
            ? {
                reason:
                  "Commerce is disabled until the deployment explicitly enables its reviewed read-only provider."
              }
            : commerceConnected
              ? {}
              : { reason: "The current user has no active Commerce connection." })
        },
        prepare: PrepareModuleStatus
      }
    };
  }

  listCapabilities(): Record<string, unknown> {
    const enabledTools = [
      "connection_status",
      "list_capabilities",
      "search",
      "fetch"
    ];
    if (this.health.providerMode !== "disabled") {
      enabledTools.push(
        "list_clients",
        "get_client",
        "get_client_activity_stats",
        "summarize_portfolio_health",
        "find_client_health_risks",
        "compare_clients",
        "snapshot_health_metrics",
        "compare_health_snapshots"
      );
    }
    if (this.commerce) enabledTools.push("list_invoices", "get_invoice");
    return {
      enabledTools,
      disabledModules: {
        ...(this.commerce
          ? {}
          : {
              commerce:
                "Enable the reviewed Commerce provider and provision a sandbox/test connection."
            }),
        prepare: PrepareModuleStatus.reason
      }
    };
  }
}
