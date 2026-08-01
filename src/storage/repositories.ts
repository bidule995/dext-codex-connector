import { randomUUID } from "node:crypto";

import type { DextClientSummary } from "../contracts/dext-health.js";
import { ConnectorError, ConnectorErrorCode } from "../errors.js";

export interface AuditEvent {
  id: string;
  at: string;
  tenantId: string;
  userId: string;
  tool: string;
  outcome: "success" | "error";
  targetIds: string[];
  errorCode?: string;
}

export interface AuditSink {
  record(event: Omit<AuditEvent, "id" | "at">): Promise<void>;
}

export class InMemoryAuditSink implements AuditSink {
  readonly events: AuditEvent[] = [];

  async record(event: Omit<AuditEvent, "id" | "at">): Promise<void> {
    this.events.push({
      ...structuredClone(event),
      id: randomUUID(),
      at: new Date().toISOString()
    });
  }
}

export interface UpstreamConnection {
  id: string;
  tenantId: string;
  ownerUserId: string;
  module: DextModule;
  environment: DextEnvironment;
  label: string;
  state: "active" | "pending" | "invalid" | "disconnected";
  validatedAt?: string;
}

export type DextModule = "data_health" | "commerce";
export type DextEnvironment = "sandbox" | "production";

export interface EncryptedCredential {
  id: string;
  tenantId: string;
  connectionId: string;
  ciphertext: Uint8Array;
  encryptedDataKey: Uint8Array;
  nonce: Uint8Array;
  authTag: Uint8Array;
  algorithmVersion: string;
  keyReference: string;
}

export interface ConnectionRepository {
  getActiveForModule(
    tenantId: string,
    userId: string,
    module: DextModule
  ): Promise<UpstreamConnection>;
  listForUser(tenantId: string, userId: string): Promise<UpstreamConnection[]>;
  replaceActiveConnection(input: {
    tenantId: string;
    userId: string;
    module: DextModule;
    environment: DextEnvironment;
    label: string;
    tokenFingerprint: string;
    credential: Omit<EncryptedCredential, "id" | "tenantId" | "connectionId">;
  }): Promise<UpstreamConnection>;
  disconnect(
    tenantId: string,
    userId: string,
    module: DextModule
  ): Promise<void>;
}

export interface CredentialRepository {
  getActiveForConnection(
    tenantId: string,
    userId: string,
    connectionId: string
  ): Promise<EncryptedCredential>;
}

export interface HealthSnapshot {
  id: string;
  tenantId: string;
  ownerUserId: string;
  connectionId: string;
  snapshotKey: string;
  asOf: string;
  formulaVersion: string;
  clients: DextClientSummary[];
}

export interface SnapshotRepository {
  create(input: Omit<HealthSnapshot, "id">): Promise<HealthSnapshot>;
  get(
    tenantId: string,
    userId: string,
    snapshotId: string
  ): Promise<HealthSnapshot>;
}

export interface PermalinkRecord {
  publicId: string;
  tenantId: string;
  ownerUserId: string;
  connectionId: string;
  recordId: string;
}

export interface PermalinkRepository {
  getOrCreate(
    tenantId: string,
    userId: string,
    connectionId: string,
    recordId: string
  ): Promise<PermalinkRecord>;
  resolve(
    tenantId: string,
    userId: string,
    publicId: string
  ): Promise<PermalinkRecord>;
  invalidateConnection(
    tenantId: string,
    userId: string,
    connectionId: string
  ): Promise<void>;
}

export class InMemorySnapshotRepository implements SnapshotRepository {
  private readonly snapshots = new Map<string, HealthSnapshot>();
  private readonly keys = new Map<string, string>();

  async create(input: Omit<HealthSnapshot, "id">): Promise<HealthSnapshot> {
    const compoundKey = `${input.tenantId}:${input.ownerUserId}:${input.connectionId}:${input.snapshotKey}`;
    const existingId = this.keys.get(compoundKey);
    if (existingId) {
      return this.get(input.tenantId, input.ownerUserId, existingId);
    }

    const snapshot: HealthSnapshot = {
      ...structuredClone(input),
      id: `snapshot_${randomUUID()}`
    };
    this.snapshots.set(snapshot.id, snapshot);
    this.keys.set(compoundKey, snapshot.id);
    return structuredClone(snapshot);
  }

  async get(
    tenantId: string,
    userId: string,
    snapshotId: string
  ): Promise<HealthSnapshot> {
    const snapshot = this.snapshots.get(snapshotId);
    if (
      !snapshot ||
      snapshot.tenantId !== tenantId ||
      snapshot.ownerUserId !== userId
    ) {
      throw notFound(`Health snapshot ${snapshotId} was not found.`);
    }
    return structuredClone(snapshot);
  }
}

export class InMemoryPermalinkRepository implements PermalinkRepository {
  private readonly records = new Map<string, PermalinkRecord>();
  private readonly keys = new Map<string, string>();

  async getOrCreate(
    tenantId: string,
    userId: string,
    connectionId: string,
    recordId: string
  ): Promise<PermalinkRecord> {
    const key = `${tenantId}:${userId}:${connectionId}:${recordId}`;
    const existingId = this.keys.get(key);
    if (existingId) {
      return structuredClone(this.records.get(existingId)!);
    }
    const record = {
      publicId: randomUUID(),
      tenantId,
      ownerUserId: userId,
      connectionId,
      recordId
    };
    this.records.set(record.publicId, record);
    this.keys.set(key, record.publicId);
    return structuredClone(record);
  }

  async resolve(
    tenantId: string,
    userId: string,
    publicId: string
  ): Promise<PermalinkRecord> {
    const record = this.records.get(publicId);
    if (
      !record ||
      record.tenantId !== tenantId ||
      record.ownerUserId !== userId
    ) {
      throw notFound("The Dext record was not found.");
    }
    return structuredClone(record);
  }

  async invalidateConnection(
    tenantId: string,
    userId: string,
    connectionId: string
  ): Promise<void> {
    for (const [publicId, record] of this.records) {
      if (
        record.tenantId === tenantId &&
        record.ownerUserId === userId &&
        record.connectionId === connectionId
      ) {
        this.records.delete(publicId);
        this.keys.delete(
          `${tenantId}:${record.ownerUserId}:${connectionId}:${record.recordId}`
        );
      }
    }
  }
}

function notFound(message: string): ConnectorError {
  return new ConnectorError({
    code: ConnectorErrorCode.NotFound,
    message
  });
}
