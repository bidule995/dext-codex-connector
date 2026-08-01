import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  JSONRPCMessage,
  MessageExtraInfo
} from "@modelcontextprotocol/sdk/types.js";
import type {
  Transport,
  TransportSendOptions
} from "@modelcontextprotocol/sdk/shared/transport.js";

export interface OAuthSecurityScheme {
  type: "oauth2";
  scopes: string[];
}

export interface NoAuthSecurityScheme {
  type: "noauth";
}

export type ToolSecurityMode = "oauth" | "noauth";
export type ToolSecurityScheme = OAuthSecurityScheme | NoAuthSecurityScheme;

export function toolSecurity(
  scope: string,
  mode: ToolSecurityMode = "oauth"
): {
  securitySchemes: ToolSecurityScheme[];
  _meta: { securitySchemes: ToolSecurityScheme[] };
} {
  const securitySchemes: ToolSecurityScheme[] =
    mode === "noauth"
      ? [{ type: "noauth" }]
      : [{ type: "oauth2", scopes: [scope] }];
  return {
    securitySchemes,
    _meta: { securitySchemes: structuredClone(securitySchemes) }
  };
}

export function authenticationChallenge(input: {
  resourceMetadataUrl: string;
  scope: string;
  error: "invalid_token" | "insufficient_scope";
  errorDescription: string;
}): string {
  const quote = (value: string) =>
    `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  return [
    `Bearer resource_metadata=${quote(input.resourceMetadataUrl)}`,
    `scope=${quote(input.scope)}`,
    `error=${quote(input.error)}`,
    `error_description=${quote(input.errorDescription)}`
  ].join(", ");
}

class CanonicalSecurityTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(
    message: T,
    extra?: MessageExtraInfo
  ) => void;

  constructor(private readonly delegate: Transport) {}

  async start(): Promise<void> {
    this.delegate.onclose = () => this.onclose?.();
    this.delegate.onerror = (error) => this.onerror?.(error);
    this.delegate.onmessage = (message, extra) =>
      this.onmessage?.(message, extra);
    await this.delegate.start();
  }

  send(
    message: JSONRPCMessage,
    options?: TransportSendOptions
  ): Promise<void> {
    return this.delegate.send(this.addCanonicalSchemes(message), options);
  }

  close(): Promise<void> {
    return this.delegate.close();
  }

  setProtocolVersion(version: string): void {
    this.delegate.setProtocolVersion?.(version);
  }

  private addCanonicalSchemes(message: JSONRPCMessage): JSONRPCMessage {
    if (!("result" in message) || typeof message.result !== "object" || !message.result) {
      return message;
    }
    const result = message.result as Record<string, unknown>;
    if (!Array.isArray(result["tools"])) {
      return message;
    }
    const listedTools: unknown[] = result["tools"];
    const tools = listedTools.map((value: unknown) => {
      if (typeof value !== "object" || !value) {
        return value;
      }
      const tool = value as Record<string, unknown>;
      const meta = tool["_meta"];
      if (typeof meta !== "object" || !meta) {
        return tool;
      }
      const securitySchemes = (meta as Record<string, unknown>)[
        "securitySchemes"
      ];
      return Array.isArray(securitySchemes)
        ? { ...tool, securitySchemes: structuredClone(securitySchemes) }
        : tool;
    });
    return {
      ...message,
      result: { ...result, tools }
    };
  }
}

export class CanonicalSecurityMcpServer extends McpServer {
  override connect(transport: Transport): Promise<void> {
    return super.connect(new CanonicalSecurityTransport(transport));
  }
}
