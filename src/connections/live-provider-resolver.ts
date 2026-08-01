import type { CredentialDecryptor } from "../credentials/credential-decryptor.js";
import { DextHealthHttpProvider } from "../providers/dext-health/http-provider.js";
import { FixedWindowRateLimiter } from "../providers/dext-health/rate-limiter.js";
import type {
  ConnectionRepository,
  CredentialRepository
} from "../storage/repositories.js";
import type {
  DextHealthProviderResolver,
  ResolvedDextHealthProvider
} from "./provider-resolver.js";

export class LiveDextHealthProviderResolver
  implements DextHealthProviderResolver
{
  readonly configuredMode = "live" as const;
  private readonly limiter = new FixedWindowRateLimiter(60, 60_000);

  constructor(
    private readonly connections: ConnectionRepository,
    private readonly credentials: CredentialRepository,
    private readonly decryptor: CredentialDecryptor
  ) {}

  async resolve(tenantId: string): Promise<ResolvedDextHealthProvider> {
    const connection = await this.connections.getActiveForModule(
      tenantId,
      "data_health"
    );
    const credential = await this.credentials.getActiveForConnection(
      tenantId,
      connection.id
    );
    const token = await this.decryptor.decrypt(credential);
    return {
      connectionId: connection.id,
      provider: new DextHealthHttpProvider({
        token,
        connectionKey: `${tenantId}:${connection.id}`,
        rateLimiter: this.limiter
      })
    };
  }
}
