import { createHash } from "node:crypto";

import type { CredentialEncryptor } from "../credentials/credential-decryptor.js";
import { ConnectorError, ConnectorErrorCode } from "../errors.js";
import { DextCommerceHttpProvider } from "../providers/dext-commerce/http-provider.js";
import { DextHealthHttpProvider } from "../providers/dext-health/http-provider.js";
import type {
  ConnectionRepository,
  DextEnvironment,
  DextModule,
  UpstreamConnection
} from "../storage/repositories.js";

export interface UpstreamCredentialValidator {
  validate(input: {
    module: DextModule;
    environment: DextEnvironment;
    token: string;
  }): Promise<void>;
}

export interface PublicConnection {
  module: DextModule;
  environment: DextEnvironment;
  label: string;
  state: UpstreamConnection["state"];
  validatedAt?: string;
}

export function publicConnection(
  connection: UpstreamConnection
): PublicConnection {
  return {
    module: connection.module,
    environment: connection.environment,
    label: connection.label,
    state: connection.state,
    ...(connection.validatedAt === undefined
      ? {}
      : { validatedAt: connection.validatedAt })
  };
}

export class DextUpstreamCredentialValidator
  implements UpstreamCredentialValidator
{
  async validate(input: {
    module: DextModule;
    environment: DextEnvironment;
    token: string;
  }): Promise<void> {
    if (input.module === "data_health") {
      if (input.environment !== "production") {
        throw new ConnectorError({
          code: ConnectorErrorCode.InvalidInput,
          message: "Dext Data Health has no documented sandbox API host."
        });
      }
      await new DextHealthHttpProvider({ token: input.token }).listClients();
      return;
    }
    await new DextCommerceHttpProvider({
      token: input.token,
      environment: input.environment
    }).validateCredential();
  }
}

export class ConnectionService {
  constructor(
    private readonly repository: ConnectionRepository,
    private readonly encryptor: CredentialEncryptor,
    private readonly validator: UpstreamCredentialValidator,
    private readonly liveRequestsEnabled: boolean
  ) {}

  list(tenantId: string, userId: string): Promise<UpstreamConnection[]> {
    return this.repository.listForUser(tenantId, userId);
  }

  async provision(input: {
    tenantId: string;
    userId: string;
    module: DextModule;
    environment: DextEnvironment;
    label: string;
    token: string;
  }): Promise<UpstreamConnection> {
    if (!this.liveRequestsEnabled) {
      throw new ConnectorError({
        code: ConnectorErrorCode.UnsupportedCapability,
        message:
          "Live credential validation is disabled for this deployment."
      });
    }
    await this.validator.validate({
      module: input.module,
      environment: input.environment,
      token: input.token
    });
    const credential = await this.encryptor.encrypt(input.token);
    return this.repository.replaceActiveConnection({
      tenantId: input.tenantId,
      userId: input.userId,
      module: input.module,
      environment: input.environment,
      label: input.label,
      tokenFingerprint: createHash("sha256")
        .update(input.token)
        .digest("hex"),
      credential
    });
  }

  disconnect(
    tenantId: string,
    userId: string,
    module: DextModule
  ): Promise<void> {
    return this.repository.disconnect(tenantId, userId, module);
  }
}
