import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { requireScope } from "../auth/auth-service.js";
import type { AuthContext } from "../auth/types.js";
import { asConnectorError } from "../errors.js";
import type { AuditSink } from "../storage/repositories.js";
import { authenticationChallenge } from "./security.js";

export interface ToolExecutionContext {
  auth: AuthContext;
  audit: AuditSink;
  tool: string;
  requiredScope: string;
  resourceMetadataUrl: string | undefined;
  targetIds?: string[];
}

function textContent(value: unknown): CallToolResult["content"] {
  return [{ type: "text", text: JSON.stringify(value) }];
}

export function structuredResult(value: object, summary?: string): CallToolResult {
  const structuredContent = value as Record<string, unknown>;
  return {
    content: summary
      ? [{ type: "text", text: summary }]
      : textContent(structuredContent),
    structuredContent
  };
}

export function jsonTextResult(value: unknown): CallToolResult {
  return { content: textContent(value) };
}

export async function executeTool(
  context: ToolExecutionContext,
  operation: () => Promise<CallToolResult>
): Promise<CallToolResult> {
  try {
    requireScope(context.auth, context.requiredScope);
    const result = await operation();
    await context.audit.record({
      tenantId: context.auth.tenantId,
      userId: context.auth.userId,
      tool: context.tool,
      outcome: "success",
      targetIds: context.targetIds ?? []
    });
    return result;
  } catch (error) {
    const connectorError = asConnectorError(error);
    await context.audit.record({
      tenantId: context.auth.tenantId,
      userId: context.auth.userId,
      tool: context.tool,
      outcome: "error",
      targetIds: context.targetIds ?? [],
      errorCode: connectorError.code
    });
    return {
      isError: true,
      content: textContent({
        error: {
          code: connectorError.code,
          message: connectorError.message,
          retryable: connectorError.retryable,
          ...(connectorError.retryAfterMs === undefined
            ? {}
            : { retryAfterMs: connectorError.retryAfterMs })
        }
      }),
      ...(connectorError.code === "permission_denied" &&
      context.resourceMetadataUrl
        ? {
            _meta: {
              "mcp/www_authenticate": [
                authenticationChallenge({
                  resourceMetadataUrl: context.resourceMetadataUrl,
                  scope: context.requiredScope,
                  error: "insufficient_scope",
                  errorDescription: `Grant ${context.requiredScope} to continue.`
                })
              ]
            }
          }
        : {})
    };
  }
}
