import { isIP } from "node:net";

import { z } from "zod";

const BooleanStringSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  PUBLIC_BASE_URL: z.url().default("http://localhost:3000"),
  STORAGE_MODE: z.enum(["memory", "postgres"]).default("memory"),
  DATABASE_URL: z.string().min(1).optional(),
  DEXT_DATA_SOURCE: z.enum(["fixture", "live", "disabled"]).default("fixture"),
  DEXT_LIVE_REQUESTS_ENABLED: BooleanStringSchema,
  DEXT_COMMERCE_ENABLED: BooleanStringSchema,
  AUTH_MODE: z.enum(["development", "oauth"]).default("development"),
  ALLOW_DEVELOPMENT_AUTH: BooleanStringSchema,
  DEVELOPMENT_AUTH_TOKEN: z.string().min(16).default("local-dev-token-change-me"),
  DEVELOPMENT_TENANT_ID: z.string().min(1).default("local-tenant"),
  DEVELOPMENT_USER_ID: z.string().min(1).default("local-user"),
  AUTH_ISSUER: z.url().optional(),
  AUTH_AUDIENCE: z.string().min(1).optional(),
  AUTH_JWKS_URL: z.url().optional(),
  OAUTH_AUTHORIZATION_SERVER: z.url().optional(),
  CREDENTIAL_MASTER_KEY: z.string().min(43).optional(),
  CURSOR_ENCRYPTION_KEY: z
    .string()
    .min(32)
    .default("local-development-cursor-key-change-me"),
  RISK_DETAIL_REQUEST_BUDGET: z.coerce.number().int().min(1).max(50).default(40)
});

export type AppConfig = z.infer<typeof ConfigSchema>;

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLocaleLowerCase().replace(/^\[|\]$/gu, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }
  if (normalized === "::1") {
    return true;
  }
  if (isIP(normalized) === 4) {
    return normalized.startsWith("127.");
  }
  return false;
}

function validatePublicProductionUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Production requires an HTTPS PUBLIC_BASE_URL.");
  }
  if (isLoopbackHost(url.hostname) || url.hostname === "0.0.0.0" || url.hostname === "::") {
    throw new Error("Production requires a public PUBLIC_BASE_URL hostname.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("PUBLIC_BASE_URL must not contain credentials, a query, or a fragment.");
  }
  if (url.pathname !== "/") {
    throw new Error("PUBLIC_BASE_URL must be an origin without a path.");
  }
}

function validateProduction(config: AppConfig): void {
  if (config.AUTH_MODE !== "oauth") {
    throw new Error("Production rejects development authentication.");
  }
  validatePublicProductionUrl(config.PUBLIC_BASE_URL);
  if (isLoopbackHost(config.HOST) || config.HOST.toLocaleLowerCase() === "localhost") {
    throw new Error("Production requires a non-loopback HOST.");
  }
  if (config.STORAGE_MODE !== "postgres" || !config.DATABASE_URL) {
    throw new Error("Production requires Postgres storage and DATABASE_URL.");
  }
  if (!config.CREDENTIAL_MASTER_KEY) {
    throw new Error("Production requires CREDENTIAL_MASTER_KEY from a secret manager.");
  }
  if (config.DEXT_DATA_SOURCE !== "live" || !config.DEXT_LIVE_REQUESTS_ENABLED) {
    throw new Error(
      "Production requires the live provider and explicit live-request enablement; fixture fallback is forbidden."
    );
  }
  if (config.CURSOR_ENCRYPTION_KEY === "local-development-cursor-key-change-me") {
    throw new Error("Production requires a dedicated CURSOR_ENCRYPTION_KEY.");
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = ConfigSchema.parse(environment);

  if (
    config.NODE_ENV === "test" &&
    (config.DEXT_DATA_SOURCE === "live" || config.DEXT_LIVE_REQUESTS_ENABLED)
  ) {
    throw new Error(
      "Tests reject live Dext requests. Use fixtures or construct a loopback/mock provider directly."
    );
  }

  if (config.DEXT_DATA_SOURCE === "live") {
    if (!config.DEXT_LIVE_REQUESTS_ENABLED) {
      throw new Error(
        "Live Dext mode is locked. Set DEXT_LIVE_REQUESTS_ENABLED=true only for an approved isolated connection."
      );
    }
    if (config.STORAGE_MODE !== "postgres" || !config.DATABASE_URL) {
      throw new Error("Live Dext mode requires tenant-scoped Postgres storage.");
    }
    if (!config.CREDENTIAL_MASTER_KEY) {
      throw new Error("Live Dext mode requires encrypted tenant credentials.");
    }
  }

  if (config.DEXT_COMMERCE_ENABLED) {
    if (!config.DEXT_LIVE_REQUESTS_ENABLED) {
      throw new Error(
        "Dext Commerce requires explicit live-request enablement."
      );
    }
    if (
      config.STORAGE_MODE !== "postgres" ||
      !config.DATABASE_URL ||
      !config.CREDENTIAL_MASTER_KEY
    ) {
      throw new Error(
        "Dext Commerce requires Postgres storage and encrypted user credentials."
      );
    }
  }

  if (config.NODE_ENV === "production") {
    validateProduction(config);
  }

  if (config.AUTH_MODE === "development" && !config.ALLOW_DEVELOPMENT_AUTH) {
    throw new Error(
      "Development authentication requires ALLOW_DEVELOPMENT_AUTH=true."
    );
  }

  if (
    config.AUTH_MODE === "oauth" &&
    (!config.AUTH_ISSUER ||
      !config.AUTH_AUDIENCE ||
      !config.AUTH_JWKS_URL ||
      !config.OAUTH_AUTHORIZATION_SERVER)
  ) {
    throw new Error(
      "OAuth mode requires AUTH_ISSUER, AUTH_AUDIENCE, AUTH_JWKS_URL, and OAUTH_AUTHORIZATION_SERVER."
    );
  }

  return {
    ...config,
    PUBLIC_BASE_URL: new URL(config.PUBLIC_BASE_URL).origin
  };
}
