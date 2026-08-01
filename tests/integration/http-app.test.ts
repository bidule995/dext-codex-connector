import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../src/app.js";
import { ConnectorScopes } from "../../src/auth/types.js";
import { ConnectionService } from "../../src/connections/connection-service.js";
import type { AppConfig } from "../../src/config.js";
import { createDependencies, type AppDependencies } from "../../src/dependencies.js";
import { fixtureConfig } from "../helpers/config.js";
import type { ConnectionRepository } from "../../src/storage/repositories.js";

const apps: ReturnType<typeof buildApp>[] = [];

function createApp(
  config: AppConfig = fixtureConfig(),
  dependencies?: AppDependencies
) {
  const app = buildApp(config, dependencies);
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe("HTTP app", () => {
  it("reports fixture mode without authentication or upstream traffic", async () => {
    const response = await createApp().inject({
      method: "GET",
      url: "/healthz"
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      providerMode: "fixture",
      liveDextRequestsEnabled: false
    });
  });

  it("publishes protected-resource metadata", async () => {
    const response = await createApp().inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource"
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      resource: "http://localhost:3000/mcp",
      bearer_methods_supported: ["header"]
    });
  });

  it("rejects unauthenticated MCP requests before tool execution", async () => {
    const response = await createApp().inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json" },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" }
        }
      }
    });
    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toContain(
      "oauth-protected-resource"
    );
    expect(response.headers["www-authenticate"]).toContain(
      'error="invalid_token"'
    );
  });

  it("allows CORS preflight without authentication", async () => {
    const response = await createApp().inject({
      method: "OPTIONS",
      url: "/mcp"
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
  });

  it("emits canonical and compatibility OAuth schemes on the raw tools/list wire response", async () => {
    const response = await createApp().inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: "Bearer local-dev-token-change-me",
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-11-25"
      },
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      }
    });
    expect(response.statusCode).toBe(200);
    const payload = response.json<{
      result: {
        tools: Array<{
          name: string;
          securitySchemes?: unknown;
          _meta?: Record<string, unknown>;
        }>;
      };
    }>();
    const healthTool = payload.result.tools.find(
      ({ name }) => name === "list_clients"
    );
    expect(healthTool?.securitySchemes).toEqual([
      { type: "oauth2", scopes: [ConnectorScopes.HealthRead] }
    ]);
    expect(healthTool?._meta?.["securitySchemes"]).toEqual(
      healthTool?.securitySchemes
    );
  });

  it("routes opaque record links and enforces tenant, user, and records.read", async () => {
    const config = fixtureConfig();
    const dependencies = createDependencies(config);
    dependencies.auth = {
      authenticate: async (header) => ({
        tenantId: header?.includes("tenant-b") ? "tenant-b" : "tenant-a",
        userId: header?.includes("user-b") ? "user-b" : "test-user",
        scopes: header?.includes("limited")
          ? new Set([ConnectorScopes.ConnectorRead])
          : new Set([ConnectorScopes.RecordsRead]),
        mode: "development"
      })
    };
    const app = createApp(config, dependencies);
    const [searchResult] = await dependencies.health.search(
      "tenant-a",
      "test-user",
      "harbor"
    );
    const url = new URL(searchResult!.url);
    expect(url.pathname.length).toBeLessThan(100);
    expect(url.pathname).not.toContain("tenant-a");
    expect(url.pathname).not.toContain("fixture-harbor");

    const allowed = await app.inject({
      method: "GET",
      url: url.pathname,
      headers: { authorization: "Bearer tenant-a" }
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({
      id: "dext:health:client:fixture-harbor"
    });

    const limited = await app.inject({
      method: "GET",
      url: url.pathname,
      headers: { authorization: "Bearer limited" }
    });
    expect(limited.statusCode).toBe(403);
    expect(limited.headers["www-authenticate"]).toContain(
      'error="insufficient_scope"'
    );

    const wrongTenant = await app.inject({
      method: "GET",
      url: url.pathname,
      headers: { authorization: "Bearer tenant-b" }
    });
    expect(wrongTenant.statusCode).toBe(404);

    const wrongUser = await app.inject({
      method: "GET",
      url: url.pathname,
      headers: { authorization: "Bearer user-b" }
    });
    expect(wrongUser.statusCode).toBe(404);
  });

  it("provisions a user-owned connection without returning or auditing the token", async () => {
    const config = fixtureConfig();
    const dependencies = createDependencies(config);
    const stored = vi.fn<ConnectionRepository["replaceActiveConnection"]>(
      async (input) => ({
        id: "connection-test",
        tenantId: input.tenantId,
        ownerUserId: input.userId,
        module: input.module,
        environment: input.environment,
        label: input.label,
        state: "active",
        validatedAt: "2026-08-01T10:00:00.000Z"
      })
    );
    dependencies.connections = new ConnectionService(
      {
        getActiveForModule: vi.fn(),
        listForUser: vi.fn(async () => []),
        replaceActiveConnection: stored,
        disconnect: vi.fn()
      },
      {
        encrypt: vi.fn(async () => ({
          ciphertext: Uint8Array.of(1),
          encryptedDataKey: Uint8Array.of(2),
          nonce: Uint8Array.of(3),
          authTag: Uint8Array.of(4),
          algorithmVersion: "aes-256-gcm-envelope-v1",
          keyReference: "test-key"
        }))
      },
      { validate: vi.fn(async () => undefined) },
      true
    );
    const response = await createApp(config, dependencies).inject({
      method: "PUT",
      url: "/api/connections/commerce",
      headers: {
        authorization: "Bearer local-dev-token-change-me",
        "content-type": "application/json"
      },
      payload: {
        environment: "sandbox",
        label: "Isolated sandbox",
        token: "sandbox-secret-key"
      }
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).not.toContain("sandbox-secret-key");
    expect(response.json()).toMatchObject({
      connection: {
        module: "commerce",
        environment: "sandbox",
        label: "Isolated sandbox",
        state: "active"
      }
    });
    const persisted = stored.mock.calls[0]?.[0];
    expect(JSON.stringify(persisted)).not.toContain("sandbox-secret-key");
    expect(JSON.stringify(dependencies.audit)).not.toContain(
      "sandbox-secret-key"
    );
  });

  it("rate-limits authenticated connection status reads", async () => {
    const config = fixtureConfig();
    const dependencies = createDependencies(config);
    dependencies.connections = new ConnectionService(
      {
        getActiveForModule: vi.fn(),
        listForUser: vi.fn(async () => []),
        replaceActiveConnection: vi.fn(),
        disconnect: vi.fn()
      },
      { encrypt: vi.fn() },
      { validate: vi.fn() },
      false
    );
    const app = createApp(config, dependencies);
    for (let requestNumber = 0; requestNumber < 60; requestNumber += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/api/connections",
        headers: { authorization: "Bearer local-dev-token-change-me" }
      });
      expect(response.statusCode).toBe(200);
    }
    const limited = await app.inject({
      method: "GET",
      url: "/api/connections",
      headers: { authorization: "Bearer local-dev-token-change-me" }
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(limited.json()).toMatchObject({
      error: { code: "rate_limited", retryable: true }
    });
  });

  it("rate-limits each authenticated connection write route", async () => {
    const config = fixtureConfig();
    const dependencies = createDependencies(config);
    dependencies.connections = new ConnectionService(
      {
        getActiveForModule: vi.fn(),
        listForUser: vi.fn(async () => []),
        replaceActiveConnection: vi.fn(),
        disconnect: vi.fn()
      },
      { encrypt: vi.fn() },
      { validate: vi.fn() },
      false
    );
    const app = createApp(config, dependencies);
    for (let requestNumber = 0; requestNumber < 10; requestNumber += 1) {
      const response = await app.inject({
        method: "PUT",
        url: "/api/connections/commerce",
        headers: {
          authorization: "Bearer local-dev-token-change-me",
          "content-type": "application/json"
        },
        payload: {}
      });
      expect(response.statusCode).toBe(400);
    }
    const limitedProvision = await app.inject({
      method: "PUT",
      url: "/api/connections/commerce",
      headers: {
        authorization: "Bearer local-dev-token-change-me",
        "content-type": "application/json"
      },
      payload: {}
    });
    expect(limitedProvision.statusCode).toBe(429);
    expect(limitedProvision.headers["retry-after"]).toBeDefined();

    for (let requestNumber = 0; requestNumber < 10; requestNumber += 1) {
      const response = await app.inject({
        method: "DELETE",
        url: "/api/connections/commerce",
        headers: { authorization: "Bearer local-dev-token-change-me" }
      });
      expect(response.statusCode).toBe(204);
    }
    const limitedDisconnect = await app.inject({
      method: "DELETE",
      url: "/api/connections/commerce",
      headers: { authorization: "Bearer local-dev-token-change-me" }
    });
    expect(limitedDisconnect.statusCode).toBe(429);
    expect(limitedDisconnect.headers["retry-after"]).toBeDefined();
  });
});
