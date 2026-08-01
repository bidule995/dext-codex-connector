import { describe, expect, it } from "vitest";

import { ConnectorError, ConnectorErrorCode } from "../../src/errors.js";
import { FixedWindowRateLimiter } from "../../src/providers/dext-health/rate-limiter.js";

describe("FixedWindowRateLimiter", () => {
  it("limits each connection key independently and resets after the window", () => {
    let now = 1_000;
    const limiter = new FixedWindowRateLimiter(2, 60_000, () => now);

    limiter.consume("a");
    limiter.consume("a");
    limiter.consume("b");

    expect(() => limiter.consume("a")).toThrowError(ConnectorError);
    try {
      limiter.consume("a");
    } catch (error) {
      expect(error).toMatchObject({
        code: ConnectorErrorCode.RateLimited,
        retryable: true,
        retryAfterMs: 60_000
      });
    }

    now += 60_000;
    expect(() => limiter.consume("a")).not.toThrow();
  });
});
