import type {
  PermalinkRecord,
  PermalinkRepository
} from "../storage/repositories.js";

export class PermalinkService {
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
