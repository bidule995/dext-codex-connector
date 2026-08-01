import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { EncryptedCredential } from "../storage/repositories.js";

export interface CredentialDecryptor {
  decrypt(credential: EncryptedCredential): Promise<string>;
}

export interface CredentialEncryptor {
  encrypt(
    token: string
  ): Promise<Omit<EncryptedCredential, "id" | "tenantId" | "connectionId">>;
}

abstract class AesGcmEnvelopeKey {
  protected readonly masterKey: Buffer;

  constructor(encodedMasterKey: string) {
    this.masterKey = Buffer.from(encodedMasterKey, "base64url");
    if (this.masterKey.length !== 32) {
      throw new Error("CREDENTIAL_MASTER_KEY must decode to 32 bytes.");
    }
  }
}

export class AesGcmEnvelopeCredentialEncryptor
  extends AesGcmEnvelopeKey
  implements CredentialEncryptor
{
  async encrypt(
    token: string
  ): Promise<Omit<EncryptedCredential, "id" | "tenantId" | "connectionId">> {
    const dataKey = randomBytes(32);
    try {
      const keyNonce = randomBytes(12);
      const keyCipher = createCipheriv("aes-256-gcm", this.masterKey, keyNonce);
      const wrappedKey = Buffer.concat([
        keyCipher.update(dataKey),
        keyCipher.final()
      ]);
      const encryptedDataKey = Buffer.concat([
        keyNonce,
        keyCipher.getAuthTag(),
        wrappedKey
      ]);
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", dataKey, nonce);
      const ciphertext = Buffer.concat([
        cipher.update(token, "utf8"),
        cipher.final()
      ]);
      return {
        ciphertext,
        encryptedDataKey,
        nonce,
        authTag: cipher.getAuthTag(),
        algorithmVersion: "aes-256-gcm-envelope-v1",
        keyReference: "connector-master-key"
      };
    } finally {
      dataKey.fill(0);
    }
  }
}

export class AesGcmEnvelopeCredentialDecryptor
  extends AesGcmEnvelopeKey
  implements CredentialDecryptor
{
  constructor(encodedMasterKey: string) {
    super(encodedMasterKey);
  }

  async decrypt(credential: EncryptedCredential): Promise<string> {
    if (credential.algorithmVersion !== "aes-256-gcm-envelope-v1") {
      throw new Error("The credential encryption version is unsupported.");
    }
    const encryptedDataKey = Buffer.from(credential.encryptedDataKey);
    if (encryptedDataKey.length < 60) {
      throw new Error("The encrypted credential data key is malformed.");
    }
    const keyDecipher = createDecipheriv(
      "aes-256-gcm",
      this.masterKey,
      encryptedDataKey.subarray(0, 12)
    );
    keyDecipher.setAuthTag(encryptedDataKey.subarray(12, 28));
    const dataKey = Buffer.concat([
      keyDecipher.update(encryptedDataKey.subarray(28)),
      keyDecipher.final()
    ]);
    try {
      if (dataKey.length !== 32) {
        throw new Error("The decrypted credential data key is malformed.");
      }
      const decipher = createDecipheriv(
        "aes-256-gcm",
        dataKey,
        credential.nonce
      );
      decipher.setAuthTag(credential.authTag);
      return Buffer.concat([
        decipher.update(credential.ciphertext),
        decipher.final()
      ]).toString("utf8");
    } finally {
      dataKey.fill(0);
    }
  }
}
