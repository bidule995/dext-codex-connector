import { timingSafeEqual } from "node:crypto";

import { createRemoteJWKSet, jwtVerify } from "jose";

import type { AppConfig } from "../config.js";
import { ConnectorError, ConnectorErrorCode } from "../errors.js";
import {
  AllDevelopmentScopes,
  type AuthContext,
  type AuthService,
  type ExternalIdentityRepository
} from "./types.js";

function readBearerToken(header: string | undefined): string {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!match?.[1]) {
    throw new ConnectorError({
      code: ConnectorErrorCode.AuthenticationRequired,
      message: "Authentication is required."
    });
  }
  return match[1];
}

function safeTokenEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

class DevelopmentAuthService implements AuthService {
  constructor(private readonly config: AppConfig) {}

  async authenticate(
    authorizationHeader: string | undefined
  ): Promise<AuthContext> {
    const token = readBearerToken(authorizationHeader);
    if (!safeTokenEqual(token, this.config.DEVELOPMENT_AUTH_TOKEN)) {
      throw new ConnectorError({
        code: ConnectorErrorCode.AuthenticationRequired,
        message: "The development access token is invalid."
      });
    }

    return {
      tenantId: this.config.DEVELOPMENT_TENANT_ID,
      userId: this.config.DEVELOPMENT_USER_ID,
      scopes: AllDevelopmentScopes,
      mode: "development"
    };
  }
}

class OAuthAuthService implements AuthService {
  private readonly jwks;

  constructor(
    private readonly config: AppConfig,
    private readonly identities: ExternalIdentityRepository
  ) {
    this.jwks = createRemoteJWKSet(new URL(config.AUTH_JWKS_URL!));
  }

  async authenticate(
    authorizationHeader: string | undefined
  ): Promise<AuthContext> {
    const token = readBearerToken(authorizationHeader);
    try {
      if (!this.config.AUTH_ISSUER || !this.config.AUTH_AUDIENCE) {
        throw new Error("OAuth issuer and audience are not configured.");
      }
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.config.AUTH_ISSUER,
        audience: this.config.AUTH_AUDIENCE
      });

      if (!payload.sub) {
        throw new Error("Token is missing sub.");
      }

      const tenantId =
        typeof payload["tenant_id"] === "string"
          ? payload["tenant_id"]
          : undefined;
      if (!tenantId) {
        throw new Error("Token is missing tenant_id.");
      }

      const scopeValue =
        typeof payload["scope"] === "string" ? payload["scope"] : "";
      const scopes = new Set(scopeValue.split(/\s+/u).filter(Boolean));

      return this.identities.resolveIdentity(
        this.config.AUTH_ISSUER,
        tenantId,
        payload.sub,
        scopes
      );
    } catch (error) {
      throw new ConnectorError({
        code: ConnectorErrorCode.AuthenticationRequired,
        message: "The OAuth access token is invalid or expired.",
        cause: error
      });
    }
  }
}

export function createAuthService(
  config: AppConfig,
  identities?: ExternalIdentityRepository
): AuthService {
  if (config.AUTH_MODE === "oauth") {
    if (!identities) {
      throw new Error("OAuth mode requires a tenant identity repository.");
    }
    return new OAuthAuthService(config, identities);
  }
  return new DevelopmentAuthService(config);
}

export function requireScope(
  context: AuthContext,
  requiredScope: string
): void {
  if (!context.scopes.has(requiredScope)) {
    throw new ConnectorError({
      code: ConnectorErrorCode.PermissionDenied,
      message: `The connection does not grant ${requiredScope}.`
    });
  }
}
