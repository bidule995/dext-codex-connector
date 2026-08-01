import { ConnectorError, ConnectorErrorCode } from "../errors.js";
import type { CommerceService } from "./commerce-service.js";
import type {
  FetchResult,
  HealthService,
  SearchResult
} from "./health-service.js";

export class RecordService {
  constructor(
    private readonly health: HealthService,
    private readonly commerce?: CommerceService
  ) {}

  async search(
    tenantId: string,
    userId: string,
    query: string
  ): Promise<SearchResult[]> {
    const searches = [
      this.optionalSearch(() => this.health.search(tenantId, userId, query))
    ];
    if (this.commerce) {
      searches.push(
        this.optionalSearch(() => this.commerce!.search(tenantId, userId, query))
      );
    }
    const results = (await Promise.all(searches)).flat();
    return results
      .sort(
        (left, right) =>
          left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
      )
      .slice(0, 50);
  }

  fetchRecord(
    tenantId: string,
    userId: string,
    id: string,
    expectedConnectionId?: string
  ): Promise<FetchResult> {
    if (this.health.supportsRecord(id)) {
      return this.health.fetchRecord(
        tenantId,
        userId,
        id,
        expectedConnectionId
      );
    }
    if (this.commerce?.supportsRecord(id)) {
      return this.commerce.fetchRecord(
        tenantId,
        userId,
        id,
        expectedConnectionId
      );
    }
    throw new ConnectorError({
      code: ConnectorErrorCode.UnsupportedCapability,
      message: `The record type in ${id} is not enabled.`
    });
  }

  private async optionalSearch(
    operation: () => Promise<SearchResult[]>
  ): Promise<SearchResult[]> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof ConnectorError &&
        (error.code === ConnectorErrorCode.NotFound ||
          error.code === ConnectorErrorCode.UnsupportedCapability)
      ) {
        return [];
      }
      throw error;
    }
  }
}
