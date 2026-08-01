export interface AuthContext {
  tenantId: string;
  userId: string;
  scopes: ReadonlySet<string>;
  mode: "development" | "oauth";
}

export interface AuthService {
  authenticate(authorizationHeader: string | undefined): Promise<AuthContext>;
}

export interface ExternalIdentityRepository {
  resolveIdentity(
    issuer: string,
    externalTenantId: string,
    subject: string,
    tokenScopes: ReadonlySet<string>
  ): Promise<AuthContext>;
}

export const ConnectorScopes = {
  ConnectorRead: "connector.read",
  HealthRead: "health.read",
  HealthSnapshotsWrite: "health.snapshots.write",
  CommerceRead: "commerce.read",
  CommerceExtract: "commerce.extract",
  CommerceSync: "commerce.sync",
  CommerceWrite: "commerce.write",
  CommerceExport: "commerce.export",
  CommerceDestructive: "commerce.destructive"
} as const;

export type ConnectorScope =
  (typeof ConnectorScopes)[keyof typeof ConnectorScopes];

export const AllDevelopmentScopes = new Set<string>(
  Object.values(ConnectorScopes)
);
