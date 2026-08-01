import type { ZodType } from "zod";

import {
  DextCommerceCurrentUserResponseSchema,
  DextCommerceGetResponseSchema,
  DextCommerceListResponseSchema,
  type DextCommercePage,
  type DextCommerceTransaction
} from "../../contracts/dext-commerce.js";
import { ConnectorError, ConnectorErrorCode } from "../../errors.js";
import { FixedWindowRateLimiter } from "../dext-health/rate-limiter.js";
import type {
  DextCommerceProvider,
  ListCommerceInvoicesOptions
} from "./provider.js";

export interface DextCommerceHttpProviderOptions {
  token: string;
  environment: "sandbox" | "production";
  baseUrl?: string;
  fetchImplementation?: typeof fetch;
  connectionKey?: string;
  rateLimiter?: FixedWindowRateLimiter;
  allowLoopbackForTests?: boolean;
}

export class DextCommerceHttpProvider implements DextCommerceProvider {
  readonly mode = "live" as const;
  private readonly baseUrl: URL;
  private readonly fetchImplementation: typeof fetch;
  private readonly connectionKey: string;
  private readonly rateLimiter: FixedWindowRateLimiter;

  constructor(private readonly options: DextCommerceHttpProviderOptions) {
    this.baseUrl = new URL(
      options.baseUrl ??
        (options.environment === "sandbox"
          ? "https://sandbox-api.greenback.com/"
          : "https://api.greenback.com/")
    );
    const expectedHost =
      options.environment === "sandbox"
        ? "sandbox-api.greenback.com"
        : "api.greenback.com";
    const approvedLiveHost =
      this.baseUrl.protocol === "https:" &&
      this.baseUrl.hostname === expectedHost;
    const approvedTestHost =
      options.allowLoopbackForTests === true &&
      ["127.0.0.1", "::1", "[::1]"].includes(this.baseUrl.hostname) &&
      ["http:", "https:"].includes(this.baseUrl.protocol);
    if (!approvedLiveHost && !approvedTestHost) {
      throw new Error(
        "The Commerce provider requires the documented Dext Commerce host for its selected environment or an explicit loopback test host."
      );
    }
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.connectionKey = options.connectionKey ?? "default";
    this.rateLimiter = options.rateLimiter ?? new FixedWindowRateLimiter(60, 60_000);
  }

  async validateCredential(): Promise<void> {
    await this.request("v2/users/me", DextCommerceCurrentUserResponseSchema);
  }

  async listInvoices(
    options: ListCommerceInvoicesOptions
  ): Promise<DextCommercePage> {
    const url = new URL("v2/transactions", this.baseUrl);
    url.searchParams.set("types", options.types.join(","));
    url.searchParams.set("limit", options.limit.toString());
    if (options.cursor) url.searchParams.set("cursor", options.cursor);
    if (options.query) url.searchParams.set("query", options.query);
    if (options.accountIds?.length) {
      url.searchParams.set("account_ids", options.accountIds.join(","));
    }
    if (options.minTransactedAt) {
      url.searchParams.set("min_transacted_at", options.minTransactedAt);
    }
    if (options.maxTransactedAt) {
      url.searchParams.set("max_transacted_at", options.maxTransactedAt);
    }
    const response = await this.request(url, DextCommerceListResponseSchema);
    const allowedTypes = new Set<string>(options.types);
    const transactions = response.values.filter(({ type }) =>
      allowedTypes.has(type)
    );
    return {
      transactions,
      count: transactions.length,
      ...(response.pagination.total_count === undefined
        ? {}
        : { totalCount: response.pagination.total_count }),
      ...(response.pagination.next === undefined
        ? {}
        : { nextCursor: response.pagination.next })
    };
  }

  async getInvoice(transactionId: string): Promise<DextCommerceTransaction> {
    const response = await this.request(
      `v2/transactions/${encodeURIComponent(transactionId)}`,
      DextCommerceGetResponseSchema
    );
    if (response.value.type !== "invoice" && response.value.type !== "bill") {
      throw new ConnectorError({
        code: ConnectorErrorCode.NotFound,
        message: "The requested Commerce transaction is not an invoice or bill."
      });
    }
    return response.value;
  }

  private async request<T>(path: string | URL, schema: ZodType<T>): Promise<T> {
    this.rateLimiter.consume(this.connectionKey);
    const url = path instanceof URL ? path : new URL(path, this.baseUrl);
    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.options.token}`
        },
        signal: AbortSignal.timeout(15_000)
      });
    } catch (error) {
      throw new ConnectorError({
        code: ConnectorErrorCode.UpstreamUnavailable,
        message: "Dext Commerce did not respond.",
        retryable: true,
        cause: error
      });
    }
    if (!response.ok) throw this.mapHttpError(response);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new ConnectorError({
        code: ConnectorErrorCode.UpstreamUnavailable,
        message: "Dext Commerce returned invalid JSON.",
        cause: error
      });
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ConnectorError({
        code: ConnectorErrorCode.UpstreamUnavailable,
        message: "Dext Commerce returned an unsupported response shape.",
        cause: parsed.error
      });
    }
    return parsed.data;
  }

  private mapHttpError(response: Response): ConnectorError {
    if (response.status === 401 || response.status === 403) {
      return new ConnectorError({
        code: ConnectorErrorCode.AuthenticationRequired,
        message: "The Dext Commerce API key was rejected."
      });
    }
    if (response.status === 404) {
      return new ConnectorError({
        code: ConnectorErrorCode.NotFound,
        message: "Dext Commerce could not find the requested resource."
      });
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      return new ConnectorError({
        code: ConnectorErrorCode.RateLimited,
        message: "Dext Commerce rate-limited the request.",
        retryable: true,
        ...(Number.isFinite(retryAfter)
          ? { retryAfterMs: retryAfter * 1_000 }
          : {})
      });
    }
    return new ConnectorError({
      code: ConnectorErrorCode.UpstreamUnavailable,
      message: "Dext Commerce returned a server error.",
      retryable: response.status >= 500
    });
  }
}
