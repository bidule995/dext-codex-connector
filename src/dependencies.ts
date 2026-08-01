import type { AppConfig } from "./config.js";
import { createAuthService } from "./auth/auth-service.js";
import type { AuthService, ExternalIdentityRepository } from "./auth/types.js";
import { LiveDextHealthProviderResolver } from "./connections/live-provider-resolver.js";
import {
  StaticDextHealthProviderResolver,
  type DextHealthProviderResolver
} from "./connections/provider-resolver.js";
import { AesGcmEnvelopeCredentialDecryptor } from "./credentials/credential-decryptor.js";
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
import { CursorService } from "./services/cursor-service.js";
import { HealthService } from "./services/health-service.js";
import { PermalinkService } from "./services/permalink-service.js";

export interface AppDependencies {
  auth: AuthService;
  audit: AuditSink;
  snapshots: SnapshotRepository;
  permalinks: PermalinkService;
  health: HealthService;
  capabilities: CapabilityService;
  resourceMetadataUrl: string;
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

  return {
    auth: createAuthService(config, repositories.identities),
    audit: repositories.audit,
    snapshots: repositories.snapshots,
    permalinks,
    health,
    capabilities: new CapabilityService(config, health),
    resourceMetadataUrl: new URL(
      "/.well-known/oauth-protected-resource",
      config.PUBLIC_BASE_URL
    ).toString(),
    close: async () => repositories.close()
  };
}
