import { describe, expect, it, vi } from "vitest";

import {
  ConnectionService,
  type UpstreamCredentialValidator
} from "../../src/connections/connection-service.js";
import type { CredentialEncryptor } from "../../src/credentials/credential-decryptor.js";
import type {
  ConnectionRepository,
  EncryptedCredential,
  UpstreamConnection
} from "../../src/storage/repositories.js";

function encryptedCredential(): Omit<
  EncryptedCredential,
  "id" | "tenantId" | "connectionId"
> {
  return {
    ciphertext: Uint8Array.of(1),
    encryptedDataKey: Uint8Array.of(2),
    nonce: Uint8Array.of(3),
    authTag: Uint8Array.of(4),
    algorithmVersion: "aes-256-gcm-envelope-v1",
    keyReference: "test-key"
  };
}

function connection(): UpstreamConnection {
  return {
    id: "connection-test",
    tenantId: "tenant-test",
    ownerUserId: "user-test",
    module: "commerce",
    environment: "sandbox",
    label: "Sandbox",
    state: "active",
    validatedAt: "2026-08-01T10:00:00.000Z"
  };
}

describe("ConnectionService", () => {
  it("validates before encrypting and persists only encrypted material", async () => {
    const order: string[] = [];
    const replaceActiveConnection = vi.fn(
      async (
        input: Parameters<ConnectionRepository["replaceActiveConnection"]>[0]
      ) => {
        order.push("store");
        expect(input.tokenFingerprint).toMatch(/^[0-9a-f]{64}$/u);
        expect(JSON.stringify(input)).not.toContain("sandbox-secret");
        return connection();
      }
    );
    const repository: ConnectionRepository = {
      getActiveForModule: vi.fn(),
      listForUser: vi.fn(async () => []),
      replaceActiveConnection,
      disconnect: vi.fn()
    };
    const encryptor: CredentialEncryptor = {
      encrypt: vi.fn(async (token) => {
        order.push("encrypt");
        expect(token).toBe("sandbox-secret");
        return encryptedCredential();
      })
    };
    const validator: UpstreamCredentialValidator = {
      validate: vi.fn(async ({ token }) => {
        order.push("validate");
        expect(token).toBe("sandbox-secret");
      })
    };
    const service = new ConnectionService(
      repository,
      encryptor,
      validator,
      true
    );
    await expect(
      service.provision({
        tenantId: "tenant-test",
        userId: "user-test",
        module: "commerce",
        environment: "sandbox",
        label: "Sandbox",
        token: "sandbox-secret"
      })
    ).resolves.toEqual(connection());
    expect(order).toEqual(["validate", "encrypt", "store"]);
  });

  it("fails closed before validation when live requests are disabled", async () => {
    const validate = vi.fn<UpstreamCredentialValidator["validate"]>();
    const validator: UpstreamCredentialValidator = { validate };
    const service = new ConnectionService(
      {
        getActiveForModule: vi.fn(),
        listForUser: vi.fn(async () => []),
        replaceActiveConnection: vi.fn(),
        disconnect: vi.fn()
      },
      { encrypt: vi.fn() },
      validator,
      false
    );
    await expect(
      service.provision({
        tenantId: "tenant-test",
        userId: "user-test",
        module: "commerce",
        environment: "sandbox",
        label: "Sandbox",
        token: "sandbox-secret"
      })
    ).rejects.toMatchObject({ code: "unsupported_capability" });
    expect(validate).not.toHaveBeenCalled();
  });
});
