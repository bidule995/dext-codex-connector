import {
  StreamableHTTPServerTransport,
  type StreamableHTTPServerTransportOptions
} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest
} from "fastify";

import { ConnectorScopes } from "./auth/types.js";
import { requireScope } from "./auth/auth-service.js";
import type { AppConfig } from "./config.js";
import { createDependencies, type AppDependencies } from "./dependencies.js";
import { asConnectorError, ConnectorErrorCode } from "./errors.js";
import { createMcpServer } from "./mcp/create-server.js";
import { authenticationChallenge } from "./mcp/security.js";

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
    reply.header("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
    reply.header("access-control-expose-headers", "mcp-session-id");
  });

  app.get("/", async () => ({
    name: "dext-codex-connector",
    version: "0.1.0",
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
        requireScope(auth, ConnectorScopes.HealthRead);
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
          request.params.token
        );
        const result = await dependencies.health.fetchRecord(
          auth.tenantId,
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
        return writeHttpError(reply, error, config, ConnectorScopes.HealthRead);
      }
    }
  );

  return app;
}
