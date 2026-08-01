import type {
  PermalinkRecord,
  PermalinkRepository
} from "../storage/repositories.js";

export interface RecordLinkService {
  create(
    tenantId: string,
    userId: string,
    connectionId: string,
    recordId: string
  ): Promise<string>;
}

export class PermalinkService implements RecordLinkService {
  constructor(
    private readonly baseUrl: string,
    private readonly repository: PermalinkRepository
  ) {}

  async create(
    tenantId: string,
    userId: string,
    connectionId: string,
    recordId: string
  ): Promise<string> {
    const record = await this.repository.getOrCreate(
      tenantId,
      userId,
      connectionId,
      recordId
    );
    return new URL(`/records/${record.publicId}`, this.baseUrl).toString();
  }

  resolve(
    tenantId: string,
    userId: string,
    publicId: string
  ): Promise<PermalinkRecord> {
    return this.repository.resolve(tenantId, userId, publicId);
  }
}

export class StaticRecordLinkService implements RecordLinkService {
  constructor(private readonly url: string) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error("Static record links must use HTTPS.");
    }
  }

  async create(
    tenantId: string,
    userId: string,
    connectionId: string,
    recordId: string
  ): Promise<string> {
    void tenantId;
    void userId;
    void connectionId;
    void recordId;
    return this.url;
  }
}
