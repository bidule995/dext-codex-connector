import { loadConfig, type AppConfig } from "../../src/config.js";

export function fixtureConfig(
  overrides: NodeJS.ProcessEnv = {}
): AppConfig {
  return loadConfig({
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: "3000",
    PUBLIC_BASE_URL: "http://localhost:3000",
    STORAGE_MODE: "memory",
    DEXT_DATA_SOURCE: "fixture",
    DEXT_LIVE_REQUESTS_ENABLED: "false",
    AUTH_MODE: "development",
    ALLOW_DEVELOPMENT_AUTH: "true",
    DEVELOPMENT_AUTH_TOKEN: "local-dev-token-change-me",
    DEVELOPMENT_TENANT_ID: "test-tenant",
    DEVELOPMENT_USER_ID: "test-user",
    CURSOR_ENCRYPTION_KEY: "test-cursor-encryption-key-at-least-32-bytes",
    ...overrides
  });
}
