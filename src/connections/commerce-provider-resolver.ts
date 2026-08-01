import type { CredentialDecryptor } from "../credentials/credential-decryptor.js";
import { DextCommerceHttpProvider } from "../providers/dext-commerce/http-provider.js";
import type { DextCommerceProvider } from "../providers/dext-commerce/provider.js";
import { FixedWindowRateLimiter } from "../providers/dext-health/rate-limiter.js";
import type {
  ConnectionRepository,
  CredentialRepository
} from "../storage/repositories.js";

export interface ResolvedDextCommerceProvider {
  connectionId: string;
  provider: DextCommerceProvider;
}

export interface DextCommerceProviderResolver {
  resolve(
    tenantId: string,
    userId: string
  ): Promise<ResolvedDextCommerceProvider>;
}

export class StaticDextCommerceProviderResolver
  implements DextCommerceProviderResolver
{
  constructor(
    private readonly provider: DextCommerceProvider,
    private readonly connectionId = "static-commerce"
  ) {}

  async resolve(
    tenantId: string,
    userId: string
  ): Promise<ResolvedDextCommerceProvider> {
    void tenantId;
    void userId;
    return { connectionId: this.connectionId, provider: this.provider };
  }
}

export class LiveDextCommerceProviderResolver
  implements DextCommerceProviderResolver
{
  private readonly limiter = new FixedWindowRateLimiter(60, 60_000);

  constructor(
    private readonly connections: ConnectionRepository,
    private readonly credentials: CredentialRepository,
    private readonly decryptor: CredentialDecryptor
  ) {}

  async resolve(
    tenantId: string,
    userId: string
  ): Promise<ResolvedDextCommerceProvider> {
    const connection = await this.connections.getActiveForModule(
      tenantId,
      userId,
      "commerce"
    );
    const credential = await this.credentials.getActiveForConnection(
      tenantId,
      userId,
      connection.id
    );
    const token = await this.decryptor.decrypt(credential);
    return {
      connectionId: connection.id,
      provider: new DextCommerceHttpProvider({
        token,
        environment: connection.environment,
        connectionKey: `${tenantId}:${userId}:${connection.id}`,
        rateLimiter: this.limiter
      })
    };
  }
}
