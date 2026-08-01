import { CommerceEndpointCatalog } from "../providers/dext-commerce/catalog.js";
import { PrepareModuleStatus } from "../providers/dext-prepare/status.js";
import type { HealthService } from "./health-service.js";

export interface CapabilityConfig {
  liveDextRequestsEnabled: boolean;
}

export class CapabilityService {
  constructor(
    private readonly config: CapabilityConfig,
    private readonly health: HealthService
  ) {}

  async connectionStatus(tenantId: string): Promise<Record<string, unknown>> {
    const healthStatus = await this.health.connectionStatus(tenantId);
    return {
      providerMode: healthStatus.mode,
      liveDextRequestsEnabled: this.config.liveDextRequestsEnabled,
      modules: {
        dataHealth: {
          enabled: healthStatus.enabled,
          mode: healthStatus.mode,
          endpointContracts: 3
        },
        commerce: {
          enabled: false,
          endpointContracts: CommerceEndpointCatalog.length,
          reason:
            "Commerce tools stay disabled until sandbox credentials and contract tests are available."
        },
        prepare: PrepareModuleStatus
      }
    };
  }

  listCapabilities(): Record<string, unknown> {
    return {
      enabledTools:
        this.health.providerMode === "disabled"
          ? ["connection_status", "list_capabilities"]
          : [
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
            ],
      disabledModules: {
        commerce:
          "Sandbox credentials and contract tests are required before tool registration.",
        prepare: PrepareModuleStatus.reason
      }
    };
  }
}
