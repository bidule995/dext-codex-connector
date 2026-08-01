import { randomBytes } from "node:crypto";

import {
  AllDevelopmentScopes,
  type AuthContext,
  type AuthService
} from "../auth/types.js";
import { StaticDextCommerceProviderResolver } from "../connections/commerce-provider-resolver.js";
import { StaticDextHealthProviderResolver } from "../connections/provider-resolver.js";
import type { AppDependencies } from "../dependencies.js";
import { DextCommerceHttpProvider } from "../providers/dext-commerce/http-provider.js";
import { DisabledDextHealthProvider } from "../providers/dext-health/disabled-provider.js";
import { DextHealthHttpProvider } from "../providers/dext-health/http-provider.js";
import { CapabilityService } from "../services/capability-service.js";
import { CommerceService } from "../services/commerce-service.js";
import { CursorService } from "../services/cursor-service.js";
import { HealthService } from "../services/health-service.js";
import {
  PermalinkService,
  StaticRecordLinkService
} from "../services/permalink-service.js";
import { RecordService } from "../services/record-service.js";
import {
  InMemoryAuditSink,
  InMemoryPermalinkRepository,
  InMemorySnapshotRepository
} from "../storage/repositories.js";
import {
  loadLocalPluginConfig,
  type LoadLocalPluginConfigOptions,
  type LocalPluginConfig
} from "./local-config.js";

const LocalBaseUrl = "https://app.dext.com/";

export const PluginLocalAuth: AuthContext = Object.freeze({
  tenantId: "codex-plugin-local-tenant",
  userId: "codex-plugin-local-user",
  scopes: AllDevelopmentScopes,
  mode: "development"
});

function cloneLocalAuth(): AuthContext {
  return {
    tenantId: PluginLocalAuth.tenantId,
    userId: PluginLocalAuth.userId,
    scopes: new Set(PluginLocalAuth.scopes),
    mode: PluginLocalAuth.mode
  };
}

export interface CreatePluginLocalDependenciesOptions
  extends LoadLocalPluginConfigOptions {
  fetchImplementation?: typeof fetch;
}

export interface PluginLocalRuntime {
  auth: AuthContext;
  config: LocalPluginConfig;
  dependencies: AppDependencies;
}

export async function createPluginLocalDependencies(
  options: CreatePluginLocalDependenciesOptions = {}
): Promise<PluginLocalRuntime> {
  const config = await loadLocalPluginConfig(options);
  const audit = new InMemoryAuditSink();
  const snapshots = new InMemorySnapshotRepository();
  const permalinkRepository = new InMemoryPermalinkRepository();
  const permalinks = new PermalinkService(LocalBaseUrl, permalinkRepository);
  const recordLinks = new StaticRecordLinkService(LocalBaseUrl);

  const healthProvider =
    config.dataHealth.enabled && config.dataHealth.token
      ? new DextHealthHttpProvider({
          token: config.dataHealth.token,
          connectionKey: "local-data-health",
          ...(options.fetchImplementation
            ? { fetchImplementation: options.fetchImplementation }
            : {})
        })
      : new DisabledDextHealthProvider();
  const healthProviders = new StaticDextHealthProviderResolver(
    healthProvider,
    new Map(),
    "local-data-health"
  );
  const health = new HealthService(
    healthProviders,
    snapshots,
    recordLinks,
    new CursorService(randomBytes(32).toString("base64url")),
    config.riskDetailRequestBudget
  );

  let commerce: CommerceService | undefined;
  if (
    config.commerce.enabled &&
    config.commerce.apiKey &&
    config.mode === "live"
  ) {
    const provider = new DextCommerceHttpProvider({
      token: config.commerce.apiKey,
      environment: config.commerce.environment,
      connectionKey: `local-commerce-${config.commerce.environment}`,
      ...(options.fetchImplementation
        ? { fetchImplementation: options.fetchImplementation }
        : {})
    });
    commerce = new CommerceService(
      new StaticDextCommerceProviderResolver(
        provider,
        `local-commerce-${config.commerce.environment}`
      ),
      recordLinks
    );
  }
  const records = new RecordService(health, commerce);
  const auth: AuthService = {
    authenticate: async () => cloneLocalAuth()
  };
  const dependencies: AppDependencies = {
    auth,
    audit,
    snapshots,
    permalinks,
    health,
    records,
    ...(commerce ? { commerce } : {}),
    capabilities: new CapabilityService(
      {
        liveDextRequestsEnabled: config.mode === "live",
        commerceEnabled: config.commerce.enabled
      },
      health,
      commerce,
      undefined,
      config.capabilityStatus
    ),
    close: async () => undefined
  };

  return { auth: cloneLocalAuth(), config, dependencies };
}
