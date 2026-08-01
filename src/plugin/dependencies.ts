import {
  AllDevelopmentScopes,
  type AuthContext,
  type AuthService
} from "../auth/types.js";
import { StaticDextHealthProviderResolver } from "../connections/provider-resolver.js";
import type { AppDependencies } from "../dependencies.js";
import { FixtureDextHealthProvider } from "../providers/dext-health/fixture-provider.js";
import { CapabilityService } from "../services/capability-service.js";
import { CursorService } from "../services/cursor-service.js";
import { HealthService } from "../services/health-service.js";
import { PermalinkService } from "../services/permalink-service.js";
import {
  InMemoryAuditSink,
  InMemoryPermalinkRepository,
  InMemorySnapshotRepository
} from "../storage/repositories.js";

const FixtureBaseUrl = "https://fixture.invalid/";
const FixtureCursorKey =
  "dext-codex-plugin-fixture-cursor-key-not-a-production-secret";
const FixtureRiskDetailBudget = 20;

export const PluginFixtureAuth: AuthContext = Object.freeze({
  tenantId: "codex-plugin-fixture-tenant",
  userId: "codex-plugin-fixture-user",
  scopes: AllDevelopmentScopes,
  mode: "development"
});

function cloneFixtureAuth(): AuthContext {
  return {
    tenantId: PluginFixtureAuth.tenantId,
    userId: PluginFixtureAuth.userId,
    scopes: new Set(PluginFixtureAuth.scopes),
    mode: PluginFixtureAuth.mode
  };
}

export function createPluginFixtureDependencies(): AppDependencies {
  const audit = new InMemoryAuditSink();
  const snapshots = new InMemorySnapshotRepository();
  const permalinkRepository = new InMemoryPermalinkRepository();
  const permalinks = new PermalinkService(FixtureBaseUrl, permalinkRepository);
  const providers = new StaticDextHealthProviderResolver(
    new FixtureDextHealthProvider()
  );
  const health = new HealthService(
    providers,
    snapshots,
    permalinks,
    new CursorService(FixtureCursorKey),
    FixtureRiskDetailBudget
  );
  const auth: AuthService = {
    authenticate: async () => cloneFixtureAuth()
  };

  return {
    auth,
    audit,
    snapshots,
    permalinks,
    health,
    capabilities: new CapabilityService(
      { liveDextRequestsEnabled: false },
      health
    ),
    resourceMetadataUrl: new URL(
      "/.well-known/oauth-protected-resource",
      FixtureBaseUrl
    ).toString(),
    close: async () => undefined
  };
}
