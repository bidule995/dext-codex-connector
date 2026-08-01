import { ConnectorError, ConnectorErrorCode } from "../../errors.js";

interface WindowState {
  startedAtMs: number;
  count: number;
}

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  consume(key: string): void {
    const currentTime = this.now();
    const current = this.windows.get(key);
    if (!current || currentTime - current.startedAtMs >= this.windowMs) {
      this.windows.set(key, { startedAtMs: currentTime, count: 1 });
      return;
    }

    if (current.count >= this.limit) {
      throw new ConnectorError({
        code: ConnectorErrorCode.RateLimited,
        message: "The Dext Data Health rate limit has been reached.",
        retryable: true,
        retryAfterMs: Math.max(
          0,
          current.startedAtMs + this.windowMs - currentTime
        )
      });
    }

    current.count += 1;
  }
}
