import { describe, expect, it, vi } from "vitest";

import {
  DextClientDetailSchema,
  DextClientListSchema
} from "../../src/contracts/dext-health.js";
import { DextHealthHttpProvider } from "../../src/providers/dext-health/http-provider.js";

describe("Dext Data Health contracts", () => {
  it("accepts documented fields and preserves unknown additive fields", () => {
    const parsed = DextClientDetailSchema.parse({
      id: "fictional-id",
      name: "Fictional Company Ltd",
      providerId: "fictional-provider",
      practiceCode: null,
      organisationType: null,
      companyNumber: null,
      healthScore: 75,
      alertLevel: "success",
      hmrcStatus: null,
      yearEnd: null,
      vatDetails: null,
      metrics: null,
      bankReconciliation: null,
      futureField: "kept"
    });
    expect(parsed.futureField).toBe("kept");
  });

  it("rejects an out-of-range health score", () => {
    expect(() =>
      DextClientListSchema.parse([
        {
          id: "fictional-id",
          name: "Fictional Company Ltd",
          providerId: "fictional-provider",
          practiceCode: null,
          healthScore: 101,
          alertLevel: "danger"
        }
      ])
    ).toThrow();
  });

  it("uses only the allowlisted host and bearer header with a mocked fetch", async () => {
    const mockedFetch = vi.fn<typeof fetch>(async (input, init) => {
      const inputUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      expect(new URL(inputUrl).hostname).toBe(
        "api.precision.dext.com"
      );
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer fictional-token"
      );
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const provider = new DextHealthHttpProvider({
      token: "fictional-token",
      fetchImplementation: mockedFetch
    });

    await expect(provider.listClients()).resolves.toEqual([]);
    expect(mockedFetch).toHaveBeenCalledOnce();
  });

  it("rejects a non-Dext live host before any request", () => {
    expect(
      () =>
        new DextHealthHttpProvider({
          token: "fictional-token",
          baseUrl: "https://example.invalid/"
        })
    ).toThrow(/current Dext API host/u);
  });

  it("allows only an explicit loopback host for mocked contract requests", async () => {
    const mockedFetch = vi.fn<typeof fetch>(async (input) => {
      const inputUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      expect(new URL(inputUrl).hostname).toBe("127.0.0.1");
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    expect(
      () =>
        new DextHealthHttpProvider({
          token: "fictional-token",
          baseUrl: "http://127.0.0.1:43127/"
        })
    ).toThrow(/explicit loopback test host/u);
    const provider = new DextHealthHttpProvider({
      token: "fictional-token",
      baseUrl: "http://127.0.0.1:43127/",
      fetchImplementation: mockedFetch,
      allowLoopbackForTests: true
    });
    await expect(provider.listClients()).resolves.toEqual([]);
    expect(mockedFetch).toHaveBeenCalledOnce();
  });
});
