import type { ZodType } from "zod";

import {
  DextClientActivityStatsSchema,
  DextClientDetailSchema,
  DextClientListSchema,
  type DextClientActivityStats,
  type DextClientDetail,
  type DextClientSummary
} from "../../contracts/dext-health.js";
import { ConnectorError, ConnectorErrorCode } from "../../errors.js";
import type { DextHealthProvider } from "./provider.js";
import { FixedWindowRateLimiter } from "./rate-limiter.js";

export interface DextHealthHttpProviderOptions {
  token: string;
  baseUrl?: string;
  fetchImplementation?: typeof fetch;
  connectionKey?: string;
  rateLimiter?: FixedWindowRateLimiter;
  allowLoopbackForTests?: boolean;
}

export class DextHealthHttpProvider implements DextHealthProvider {
  readonly mode = "live" as const;
  private readonly baseUrl: URL;
  private readonly fetchImplementation: typeof fetch;
  private readonly connectionKey: string;
  private readonly rateLimiter: FixedWindowRateLimiter;

  constructor(private readonly options: DextHealthHttpProviderOptions) {
    this.baseUrl = new URL(
      options.baseUrl ?? "https://api.precision.dext.com/"
    );
    const approvedLiveHost =
      this.baseUrl.protocol === "https:" &&
      this.baseUrl.hostname === "api.precision.dext.com";
    const approvedTestHost =
      options.allowLoopbackForTests === true &&
      (this.baseUrl.hostname === "127.0.0.1" ||
        this.baseUrl.hostname === "[::1]" ||
        this.baseUrl.hostname === "::1") &&
      (this.baseUrl.protocol === "http:" || this.baseUrl.protocol === "https:");
    if (!approvedLiveHost && !approvedTestHost) {
      throw new Error(
        "The Data Health provider requires the current Dext API host or an explicit loopback test host."
      );
    }
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.connectionKey = options.connectionKey ?? "default";
    this.rateLimiter =
      options.rateLimiter ?? new FixedWindowRateLimiter(60, 60_000);
  }

  async listClients(): Promise<DextClientSummary[]> {
    return this.request("clients", DextClientListSchema);
  }

  async getClient(clientId: string): Promise<DextClientDetail> {
    return this.request(
      `clients/${encodeURIComponent(clientId)}`,
      DextClientDetailSchema
    );
  }

  async getClientActivityStats(
    clientId: string
  ): Promise<DextClientActivityStats> {
    return this.request(
      `clients/${encodeURIComponent(clientId)}/activity-stats`,
      DextClientActivityStatsSchema
    );
  }

  private async request<T>(path: string, schema: ZodType<T>): Promise<T> {
    this.rateLimiter.consume(this.connectionKey);
    const url = new URL(path, this.baseUrl);

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
        message: "Dext Data Health did not respond.",
        retryable: true,
        cause: error
      });
    }

    if (!response.ok) {
      throw this.mapHttpError(response);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new ConnectorError({
        code: ConnectorErrorCode.UpstreamUnavailable,
        message: "Dext Data Health returned invalid JSON.",
        cause: error
      });
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ConnectorError({
        code: ConnectorErrorCode.UpstreamUnavailable,
        message: "Dext Data Health returned an unsupported response shape.",
        cause: parsed.error
      });
    }
    return parsed.data;
  }

  private mapHttpError(response: Response): ConnectorError {
    if (response.status === 401 || response.status === 403) {
      return new ConnectorError({
        code: ConnectorErrorCode.AuthenticationRequired,
        message: "The Dext Data Health token was rejected."
      });
    }
    if (response.status === 404) {
      return new ConnectorError({
        code: ConnectorErrorCode.NotFound,
        message: "Dext Data Health could not find the requested resource."
      });
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const retryAfterMs = Number.isFinite(retryAfter)
        ? retryAfter * 1_000
        : undefined;
      return new ConnectorError({
        code: ConnectorErrorCode.RateLimited,
        message: "Dext Data Health rate-limited the request.",
        retryable: true,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs })
      });
    }
    return new ConnectorError({
      code: ConnectorErrorCode.UpstreamUnavailable,
      message: "Dext Data Health returned a server error.",
      retryable: response.status >= 500
    });
  }
}
