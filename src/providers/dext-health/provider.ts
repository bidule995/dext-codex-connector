import type {
  DextClientActivityStats,
  DextClientDetail,
  DextClientSummary
} from "../../contracts/dext-health.js";

export interface DextHealthProvider {
  readonly mode: "fixture" | "live" | "disabled";
  listClients(): Promise<DextClientSummary[]>;
  getClient(clientId: string): Promise<DextClientDetail>;
  getClientActivityStats(
    clientId: string
  ): Promise<DextClientActivityStats>;
}
