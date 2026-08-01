import {
  StreamableHTTPServerTransport,
  type StreamableHTTPServerTransportOptions
} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import rateLimit from "@fastify/rate-limit";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest
} from "fastify";
import { z } from "zod";

import { ConnectorScopes, type AuthContext } from "./auth/types.js";
import { publicConnection } from "./connections/connection-service.js";
import { requireScope } from "./auth/auth-service.js";
import type { AppConfig } from "./config.js";
import { createDependencies, type AppDependencies } from "./dependencies.js";
import {
  asConnectorError,
  ConnectorError,
  ConnectorErrorCode
} from "./errors.js";
import { createMcpServer } from "./mcp/create-server.js";
import { authenticationChallenge } from "./mcp/security.js";
import { CONNECTOR_VERSION } from "./version.js";

const ConnectionModuleSchema = z.enum(["data_health", "commerce"]);
const ProvisionConnectionSchema = z.object({
  environment: z.enum(["sandbox", "production"]),
  label: z.string().trim().min(1).max(100),
  token: z.string().min(8).max(20_000)
});

const ConnectionReadRateLimit = {
  max: 60,
  timeWindow: "1 minute"
} as const;

const ConnectionWriteRateLimit = {
  max: 10,
  timeWindow: "1 minute",
  continueExceeding: true,
  exponentialBackoff: true
} as const;

function statusForError(code: string): number {
  switch (code) {
    case ConnectorErrorCode.AuthenticationRequired:
      return 401;
    case ConnectorErrorCode.PermissionDenied:
      return 403;
    case ConnectorErrorCode.NotFound:
      return 404;
    case ConnectorErrorCode.Conflict:
      return 409;
    case ConnectorErrorCode.RateLimited:
      return 429;
    case ConnectorErrorCode.UnsupportedCapability:
      return 501;
    case ConnectorErrorCode.UpstreamUnavailable:
      return 502;
    default:
      return 400;
  }
}

function protectedResourceUrl(config: AppConfig): string {
  return new URL(
    "/.well-known/oauth-protected-resource",
    config.PUBLIC_BASE_URL
  ).toString();
}

function writeHttpError(
  reply: FastifyReply,
  error: unknown,
  config: AppConfig,
  requiredScope: string = ConnectorScopes.ConnectorRead
): FastifyReply {
  const connectorError = asConnectorError(error);
  const status = statusForError(connectorError.code);
  if (status === 401 || status === 403) {
    reply.header(
      "www-authenticate",
      authenticationChallenge({
        resourceMetadataUrl: protectedResourceUrl(config),
        scope: requiredScope,
        error: status === 401 ? "invalid_token" : "insufficient_scope",
        errorDescription:
          status === 401
            ? "Provide a valid connector access token."
            : `Grant ${requiredScope} to continue.`
      })
    );
  }
  if (connectorError.retryAfterMs !== undefined) {
    reply.header(
      "retry-after",
      Math.max(1, Math.ceil(connectorError.retryAfterMs / 1_000)).toString()
    );
  }
  return reply.status(status).send({
    error: {
      code: connectorError.code,
      message: connectorError.message,
      retryable: connectorError.retryable
    }
  });
}

async function authenticate(
  request: FastifyRequest,
  dependencies: AppDependencies
) {
  return dependencies.auth.authenticate(request.headers.authorization);
}

export function buildApp(
  config: AppConfig,
  dependencies: AppDependencies = createDependencies(config)
): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addHook("onClose", async () => dependencies.close());

  app.addHook("onRequest", async (_request, reply) => {
    reply.header("access-control-allow-origin", "*");
    reply.header(
      "access-control-allow-headers",
      "authorization, content-type, mcp-protocol-version, mcp-session-id"
    );
    reply.header(
      "access-control-allow-methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    reply.header("access-control-expose-headers", "mcp-session-id");
  });

  app.get("/", async () => ({
    name: "dext-codex-connector",
    version: CONNECTOR_VERSION,
    mcpEndpoint: "/mcp",
    providerMode: dependencies.health.providerMode
  }));

  app.get("/healthz", async () => ({
    status: "ok",
    providerMode: dependencies.health.providerMode,
    liveDextRequestsEnabled: config.DEXT_LIVE_REQUESTS_ENABLED
  }));

  app.get("/.well-known/oauth-protected-resource", async () => ({
    resource: new URL("/mcp", config.PUBLIC_BASE_URL).toString(),
    authorization_servers: config.OAUTH_AUTHORIZATION_SERVER
      ? [config.OAUTH_AUTHORIZATION_SERVER]
      : [],
    bearer_methods_supported: ["header"],
    scopes_supported: Object.values(ConnectorScopes)
  }));

  app.register(async (connectionApi) => {
    await connectionApi.register(rateLimit, {
      global: false,
      enableDraftSpec: true,
      errorResponseBuilder: (_request, context) => ({
        statusCode: 429,
        error: {
          code: ConnectorErrorCode.RateLimited,
          message: "Too many connector requests. Retry later.",
          retryable: true,
          retryAfterMs: context.ttl
        }
      })
    });

    connectionApi.get(
      "/api/connections",
      { config: { rateLimit: ConnectionReadRateLimit } },
      async (request, reply) => {
        reply.header("cache-control", "no-store");
        try {
          const auth = await authenticate(request, dependencies);
          requireScope(auth, ConnectorScopes.ConnectorRead);
          if (!dependencies.connections) {
            throw new ConnectorError({
              code: ConnectorErrorCode.UnsupportedCapability,
              message: "Connection management is unavailable in fixture mode."
            });
          }
          const connections = await dependencies.connections.list(
            auth.tenantId,
            auth.userId
          );
          return reply.send({
            connections: connections.map(publicConnection)
          });
        } catch (error) {
          return writeHttpError(
            reply,
            error,
            config,
            ConnectorScopes.ConnectorRead
          );
        }
      }
    );

    connectionApi.put<{
      Params: { module: string };
      Body: unknown;
    }>(
      "/api/connections/:module",
      { config: { rateLimit: ConnectionWriteRateLimit } },
      async (request, reply) => {
        reply.header("cache-control", "no-store");
        let auditAuth: AuthContext | undefined;
        let auditModule: string | undefined;
        try {
          const auth = await authenticate(request, dependencies);
          auditAuth = auth;
          requireScope(auth, ConnectorScopes.ConnectionsWrite);
          if (!dependencies.connections) {
            throw new ConnectorError({
              code: ConnectorErrorCode.UnsupportedCapability,
              message: "Connection management is unavailable in fixture mode."
            });
          }
          const moduleResult = ConnectionModuleSchema.safeParse(
            request.params.module
          );
          const bodyResult = ProvisionConnectionSchema.safeParse(request.body);
          if (!moduleResult.success || !bodyResult.success) {
            throw new ConnectorError({
              code: ConnectorErrorCode.InvalidInput,
              message: "The connection request is invalid."
            });
          }
          auditModule = moduleResult.data;
          const connection = await dependencies.connections.provision({
            tenantId: auth.tenantId,
            userId: auth.userId,
            module: moduleResult.data,
            environment: bodyResult.data.environment,
            label: bodyResult.data.label,
            token: bodyResult.data.token
          });
          await dependencies.audit.record({
            tenantId: auth.tenantId,
            userId: auth.userId,
            tool: "provision_connection",
            outcome: "success",
            targetIds: [connection.module]
          });
          return reply.status(201).send({
            connection: publicConnection(connection)
          });
        } catch (error) {
          if (auditAuth) {
            await dependencies.audit.record({
              tenantId: auditAuth.tenantId,
              userId: auditAuth.userId,
              tool: "provision_connection",
              outcome: "error",
              targetIds: auditModule ? [auditModule] : [],
              errorCode: asConnectorError(error).code
            });
          }
          return writeHttpError(
            reply,
            error,
            config,
            ConnectorScopes.ConnectionsWrite
          );
        }
      }
    );

    connectionApi.delete<{ Params: { module: string } }>(
      "/api/connections/:module",
      { config: { rateLimit: ConnectionWriteRateLimit } },
      async (request, reply) => {
        reply.header("cache-control", "no-store");
        let auditAuth: AuthContext | undefined;
        let auditModule: string | undefined;
        try {
          const auth = await authenticate(request, dependencies);
          auditAuth = auth;
          requireScope(auth, ConnectorScopes.ConnectionsWrite);
          if (!dependencies.connections) {
            throw new ConnectorError({
              code: ConnectorErrorCode.UnsupportedCapability,
              message: "Connection management is unavailable in fixture mode."
            });
          }
          const moduleResult = ConnectionModuleSchema.safeParse(
            request.params.module
          );
          if (!moduleResult.success) {
            throw new ConnectorError({
              code: ConnectorErrorCode.InvalidInput,
              message: "The connection module is invalid."
            });
          }
          auditModule = moduleResult.data;
          await dependencies.connections.disconnect(
            auth.tenantId,
            auth.userId,
            moduleResult.data
          );
          await dependencies.audit.record({
            tenantId: auth.tenantId,
            userId: auth.userId,
            tool: "disconnect_connection",
            outcome: "success",
            targetIds: [moduleResult.data]
          });
          return reply.status(204).send();
        } catch (error) {
          if (auditAuth) {
            await dependencies.audit.record({
              tenantId: auditAuth.tenantId,
              userId: auditAuth.userId,
              tool: "disconnect_connection",
              outcome: "error",
              targetIds: auditModule ? [auditModule] : [],
              errorCode: asConnectorError(error).code
            });
          }
          return writeHttpError(
            reply,
            error,
            config,
            ConnectorScopes.ConnectionsWrite
          );
        }
      }
    );
  });

  app.options("/mcp", async (_request, reply) => reply.status(204).send());

  app.route({
    method: ["GET", "POST", "DELETE"],
    url: "/mcp",
    handler: async (request, reply) => {
      let auth;
      try {
        auth = await authenticate(request, dependencies);
      } catch (error) {
        return writeHttpError(reply, error, config);
      }

      const server = createMcpServer(dependencies, auth);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      } as unknown as StreamableHTTPServerTransportOptions);

      try {
        // SDK 1.30 types predate exactOptionalPropertyTypes compatibility.
        await server.connect(transport as unknown as Transport);
        reply.hijack();
        await transport.handleRequest(request.raw, reply.raw, request.body);
      } catch (error) {
        if (!reply.sent) {
          return writeHttpError(reply, error, config);
        }
      } finally {
        await server.close();
      }
      return reply;
    }
  });

  app.get<{ Params: { token: string } }>(
    "/records/:token",
    async (request, reply) => {
      try {
        const auth = await authenticate(request, dependencies);
        requireScope(auth, ConnectorScopes.RecordsRead);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(request.params.token)) {
          return reply.status(404).send({
            error: {
              code: ConnectorErrorCode.NotFound,
              message: "The Dext record was not found.",
              retryable: false
            }
          });
        }
        const record = await dependencies.permalinks.resolve(
          auth.tenantId,
          auth.userId,
          request.params.token
        );
        const result = await dependencies.records.fetchRecord(
          auth.tenantId,
          auth.userId,
          record.recordId,
          record.connectionId
        );
        await dependencies.audit.record({
          tenantId: auth.tenantId,
          userId: auth.userId,
          tool: "open_record_permalink",
          outcome: "success",
          targetIds: [request.params.token]
        });
        return reply.send(result);
      } catch (error) {
        return writeHttpError(reply, error, config, ConnectorScopes.RecordsRead);
      }
    }
  );

  return app;
}
