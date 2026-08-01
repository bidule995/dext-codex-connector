import type { AppConfig } from "./config.js";
import { createAuthService } from "./auth/auth-service.js";
import type { AuthService, ExternalIdentityRepository } from "./auth/types.js";
import { LiveDextHealthProviderResolver } from "./connections/live-provider-resolver.js";
import { LiveDextCommerceProviderResolver } from "./connections/commerce-provider-resolver.js";
import {
  ConnectionService,
  DextUpstreamCredentialValidator
} from "./connections/connection-service.js";
import {
  StaticDextHealthProviderResolver,
  type DextHealthProviderResolver
} from "./connections/provider-resolver.js";
import {
  AesGcmEnvelopeCredentialDecryptor,
  AesGcmEnvelopeCredentialEncryptor
} from "./credentials/credential-decryptor.js";
import { DisabledDextHealthProvider } from "./providers/dext-health/disabled-provider.js";
import { FixtureDextHealthProvider } from "./providers/dext-health/fixture-provider.js";
import {
  InMemoryAuditSink,
  InMemoryPermalinkRepository,
  InMemorySnapshotRepository,
  type AuditSink,
  type ConnectionRepository,
  type CredentialRepository,
  type PermalinkRepository,
  type SnapshotRepository
} from "./storage/repositories.js";
import { PostgresRepositories } from "./storage/postgres.js";
import { CapabilityService } from "./services/capability-service.js";
import { CommerceService } from "./services/commerce-service.js";
import { CursorService } from "./services/cursor-service.js";
import { HealthService } from "./services/health-service.js";
import { PermalinkService } from "./services/permalink-service.js";
import { RecordService } from "./services/record-service.js";

export interface AppDependencies {
  auth: AuthService;
  audit: AuditSink;
  snapshots: SnapshotRepository;
  permalinks: PermalinkService;
  health: HealthService;
  records: RecordService;
  commerce?: CommerceService;
  connections?: ConnectionService;
  capabilities: CapabilityService;
  resourceMetadataUrl?: string;
  close(): Promise<void>;
}

interface RepositoryBundle {
  audit: AuditSink;
  snapshots: SnapshotRepository;
  permalinks: PermalinkRepository;
  connections?: ConnectionRepository;
  credentials?: CredentialRepository;
  identities?: ExternalIdentityRepository;
  close(): Promise<void>;
}

function createRepositories(config: AppConfig): RepositoryBundle {
  if (config.STORAGE_MODE === "postgres") {
    if (!config.DATABASE_URL) {
      throw new Error("Postgres storage requires DATABASE_URL.");
    }
    const postgres = new PostgresRepositories(config.DATABASE_URL);
    return {
      audit: postgres,
      snapshots: postgres,
      permalinks: postgres,
      connections: postgres,
      credentials: postgres,
      identities: postgres,
      close: async () => postgres.close()
    };
  }
  return {
    audit: new InMemoryAuditSink(),
    snapshots: new InMemorySnapshotRepository(),
    permalinks: new InMemoryPermalinkRepository(),
    close: async () => undefined
  };
}

function createHealthProviderResolver(
  config: AppConfig,
  repositories: RepositoryBundle
): DextHealthProviderResolver {
  if (config.DEXT_DATA_SOURCE === "fixture") {
    return new StaticDextHealthProviderResolver(
      new FixtureDextHealthProvider()
    );
  }
  if (config.DEXT_DATA_SOURCE === "disabled") {
    return new StaticDextHealthProviderResolver(
      new DisabledDextHealthProvider()
    );
  }
  if (
    !repositories.connections ||
    !repositories.credentials ||
    !config.CREDENTIAL_MASTER_KEY
  ) {
    throw new Error(
      "Live Dext mode requires tenant connections, encrypted credentials, and a credential master key."
    );
  }
  return new LiveDextHealthProviderResolver(
    repositories.connections,
    repositories.credentials,
    new AesGcmEnvelopeCredentialDecryptor(config.CREDENTIAL_MASTER_KEY)
  );
}

export function createDependencies(config: AppConfig): AppDependencies {
  const repositories = createRepositories(config);
  const providers = createHealthProviderResolver(config, repositories);
  const permalinks = new PermalinkService(
    config.PUBLIC_BASE_URL,
    repositories.permalinks
  );
  const health = new HealthService(
    providers,
    repositories.snapshots,
    permalinks,
    new CursorService(config.CURSOR_ENCRYPTION_KEY),
    config.RISK_DETAIL_REQUEST_BUDGET
  );
  let commerce: CommerceService | undefined;
  let connections: ConnectionService | undefined;
  if (
    repositories.connections &&
    repositories.credentials &&
    config.CREDENTIAL_MASTER_KEY
  ) {
    const decryptor = new AesGcmEnvelopeCredentialDecryptor(
      config.CREDENTIAL_MASTER_KEY
    );
    connections = new ConnectionService(
      repositories.connections,
      new AesGcmEnvelopeCredentialEncryptor(config.CREDENTIAL_MASTER_KEY),
      new DextUpstreamCredentialValidator(),
      config.DEXT_LIVE_REQUESTS_ENABLED
    );
    if (config.DEXT_COMMERCE_ENABLED) {
      commerce = new CommerceService(
        new LiveDextCommerceProviderResolver(
          repositories.connections,
          repositories.credentials,
          decryptor
        ),
        permalinks
      );
    }
  }
  const records = new RecordService(health, commerce);

  return {
    auth: createAuthService(config, repositories.identities),
    audit: repositories.audit,
    snapshots: repositories.snapshots,
    permalinks,
    health,
    records,
    ...(commerce === undefined ? {} : { commerce }),
    ...(connections === undefined ? {} : { connections }),
    capabilities: new CapabilityService(
      {
        liveDextRequestsEnabled: config.DEXT_LIVE_REQUESTS_ENABLED,
        commerceEnabled: config.DEXT_COMMERCE_ENABLED
      },
      health,
      commerce,
      connections
    ),
    resourceMetadataUrl: new URL(
      "/.well-known/oauth-protected-resource",
      config.PUBLIC_BASE_URL
    ).toString(),
    close: async () => repositories.close()
  };
}
