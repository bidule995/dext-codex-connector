import type { DextHealthProvider } from "../providers/dext-health/provider.js";
import { ConnectorError, ConnectorErrorCode } from "../errors.js";

export interface ResolvedDextHealthProvider {
  connectionId: string;
  provider: DextHealthProvider;
}

export interface DextHealthProviderResolver {
  readonly configuredMode: DextHealthProvider["mode"];
  resolve(
    tenantId: string,
    userId: string
  ): Promise<ResolvedDextHealthProvider>;
}

export class StaticDextHealthProviderResolver
  implements DextHealthProviderResolver
{
  readonly configuredMode: DextHealthProvider["mode"];
  private readonly tenantProviders: ReadonlyMap<string, DextHealthProvider>;

  constructor(
    provider: DextHealthProvider,
    tenantProviders: ReadonlyMap<string, DextHealthProvider> = new Map()
  ) {
    this.configuredMode = provider.mode;
    this.tenantProviders = new Map([["*", provider], ...tenantProviders]);
  }

  async resolve(
    tenantId: string,
    userId: string
  ): Promise<ResolvedDextHealthProvider> {
    void userId;
    const provider =
      this.tenantProviders.get(tenantId) ?? this.tenantProviders.get("*");
    if (!provider) {
      throw new ConnectorError({
        code: ConnectorErrorCode.NotFound,
        message: "No Dext Data Health connection is configured for this tenant."
      });
    }
    return {
      connectionId: `fixture-connection:${tenantId}`,
      provider
    };
  }
}
