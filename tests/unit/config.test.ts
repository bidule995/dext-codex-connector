import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config.js";
import { fixtureConfig } from "../helpers/config.js";

const masterKey = Buffer.alloc(32, 7).toString("base64url");

function productionEnvironment(
  overrides: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PUBLIC_BASE_URL: "https://dext-connector.example.com",
    STORAGE_MODE: "postgres",
    DATABASE_URL: "postgres://connector:secret@db/connector",
    DEXT_DATA_SOURCE: "fixture",
    DEXT_LIVE_REQUESTS_ENABLED: "false",
    AUTH_MODE: "oauth",
    ALLOW_DEVELOPMENT_AUTH: "false",
    AUTH_ISSUER: "https://auth.example.com",
    AUTH_AUDIENCE: "https://dext-connector.example.com/mcp",
    AUTH_JWKS_URL: "https://auth.example.com/.well-known/jwks.json",
    OAUTH_AUTHORIZATION_SERVER: "https://auth.example.com",
    CREDENTIAL_MASTER_KEY: masterKey,
    CURSOR_ENCRYPTION_KEY: "production-cursor-encryption-key-from-secret-manager",
    ...overrides
  };
}

describe("configuration safety gates", () => {
  it("defaults test construction to fixture mode with live requests disabled", () => {
    const config = fixtureConfig();
    expect(config.DEXT_DATA_SOURCE).toBe("fixture");
    expect(config.DEXT_LIVE_REQUESTS_ENABLED).toBe(false);
  });

  it("rejects live mode in a test process even when its gate is set", () => {
    expect(() =>
      fixtureConfig({
        DEXT_DATA_SOURCE: "live",
        DEXT_LIVE_REQUESTS_ENABLED: "true",
        STORAGE_MODE: "postgres",
        DATABASE_URL: "postgres://test.invalid/connector",
        CREDENTIAL_MASTER_KEY: masterKey
      })
    ).toThrow(/Tests reject live Dext mode/u);
  });

  it("rejects live development mode without the explicit gate", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "development",
        DEXT_DATA_SOURCE: "live",
        DEXT_LIVE_REQUESTS_ENABLED: "false",
        STORAGE_MODE: "postgres",
        DATABASE_URL: "postgres://test.invalid/connector",
        CREDENTIAL_MASTER_KEY: masterKey,
        AUTH_MODE: "development",
        ALLOW_DEVELOPMENT_AUTH: "true"
      })
    ).toThrow(/Live Dext mode is locked/u);
  });

  it("rejects development authentication in production", () => {
    expect(() =>
      loadConfig(
        productionEnvironment({
          AUTH_MODE: "development",
          ALLOW_DEVELOPMENT_AUTH: "true"
        })
      )
    ).toThrow(/Production rejects development authentication/u);
  });

  it.each([
    "http://dext-connector.example.com",
    "https://localhost",
    "https://127.0.0.1"
  ])("rejects unsafe production public URL %s", (PUBLIC_BASE_URL) => {
    expect(() =>
      loadConfig(productionEnvironment({ PUBLIC_BASE_URL }))
    ).toThrow(/Production requires/u);
  });

  it("rejects a production loopback bind address", () => {
    expect(() =>
      loadConfig(productionEnvironment({ HOST: "127.0.0.1" }))
    ).toThrow(/non-loopback HOST/u);
  });

  it("accepts a public HTTPS production origin and non-loopback bind", () => {
    const config = loadConfig(productionEnvironment());
    expect(config.PUBLIC_BASE_URL).toBe("https://dext-connector.example.com");
    expect(config.HOST).toBe("0.0.0.0");
  });
});
