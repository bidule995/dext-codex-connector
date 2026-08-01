import { createCipheriv, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AesGcmEnvelopeCredentialDecryptor } from "../../src/credentials/credential-decryptor.js";
import type { EncryptedCredential } from "../../src/storage/repositories.js";

function encryptCredential(token: string): {
  masterKey: string;
  credential: EncryptedCredential;
} {
  const masterKey = randomBytes(32);
  const dataKey = randomBytes(32);
  const keyNonce = randomBytes(12);
  const keyCipher = createCipheriv("aes-256-gcm", masterKey, keyNonce);
  const wrappedKey = Buffer.concat([
    keyNonce,
    keyCipher.update(dataKey),
    keyCipher.final()
  ]);
  const encryptedDataKey = Buffer.concat([
    wrappedKey.subarray(0, 12),
    keyCipher.getAuthTag(),
    wrappedKey.subarray(12)
  ]);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final()
  ]);
  dataKey.fill(0);
  return {
    masterKey: masterKey.toString("base64url"),
    credential: {
      id: "credential-test",
      tenantId: "tenant-test",
      connectionId: "connection-test",
      ciphertext,
      encryptedDataKey,
      nonce,
      authTag: cipher.getAuthTag(),
      algorithmVersion: "aes-256-gcm-envelope-v1",
      keyReference: "test-master-key"
    }
  };
}

describe("AesGcmEnvelopeCredentialDecryptor", () => {
  it("decrypts an authenticated tenant credential", async () => {
    const encrypted = encryptCredential("fictional-dext-token");
    const decryptor = new AesGcmEnvelopeCredentialDecryptor(
      encrypted.masterKey
    );
    await expect(decryptor.decrypt(encrypted.credential)).resolves.toBe(
      "fictional-dext-token"
    );
  });

  it("rejects a modified authentication tag", async () => {
    const encrypted = encryptCredential("fictional-dext-token");
    encrypted.credential.authTag[0] =
      encrypted.credential.authTag[0]! ^ 1;
    const decryptor = new AesGcmEnvelopeCredentialDecryptor(
      encrypted.masterKey
    );
    await expect(decryptor.decrypt(encrypted.credential)).rejects.toThrow();
  });
});
