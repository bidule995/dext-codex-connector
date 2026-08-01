import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";

import { ConnectorError, ConnectorErrorCode } from "../errors.js";

export interface RiskCursorPayload {
  tenantId: string;
  connectionId: string;
  filterHash: string;
  offset: number;
}

export class CursorService {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = createHash("sha256").update(secret, "utf8").digest();
  }

  create(payload: RiskCursorPayload): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final()
    ]);
    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString(
      "base64url"
    );
  }

  parse(value: string): RiskCursorPayload {
    try {
      const encoded = Buffer.from(value, "base64url");
      if (encoded.length < 29) {
        throw new Error("Cursor is too short.");
      }
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        encoded.subarray(0, 12)
      );
      decipher.setAuthTag(encoded.subarray(12, 28));
      const plaintext = Buffer.concat([
        decipher.update(encoded.subarray(28)),
        decipher.final()
      ]).toString("utf8");
      const payload = JSON.parse(plaintext) as Partial<RiskCursorPayload>;
      if (
        typeof payload.tenantId !== "string" ||
        typeof payload.connectionId !== "string" ||
        typeof payload.filterHash !== "string" ||
        !Number.isInteger(payload.offset) ||
        payload.offset! < 0
      ) {
        throw new Error("Cursor payload is invalid.");
      }
      return payload as RiskCursorPayload;
    } catch (error) {
      throw new ConnectorError({
        code: ConnectorErrorCode.InvalidInput,
        message: "The risk scan cursor is invalid or expired.",
        cause: error
      });
    }
  }
}
