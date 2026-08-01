import { ConnectorError, ConnectorErrorCode } from "../../errors.js";
import type { DextHealthProvider } from "./provider.js";

export class DisabledDextHealthProvider implements DextHealthProvider {
  readonly mode = "disabled" as const;

  listClients(): Promise<never> {
    return Promise.reject(this.error());
  }

  getClient(): Promise<never> {
    return Promise.reject(this.error());
  }

  getClientActivityStats(): Promise<never> {
    return Promise.reject(this.error());
  }

  private error(): ConnectorError {
    return new ConnectorError({
      code: ConnectorErrorCode.UnsupportedCapability,
      message: "The Dext Data Health module is disabled."
    });
  }
}
