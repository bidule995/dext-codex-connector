import { describe, expect, it, vi } from "vitest";

import { DextCommerceHttpProvider } from "../../src/providers/dext-commerce/http-provider.js";

describe("DextCommerceHttpProvider", () => {
  it("validates sandbox credentials against users/me without leaking the key", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      expect(requestUrl).toBe(
        "https://sandbox-api.greenback.com/v2/users/me"
      );
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer sandbox-secret"
      );
      return Response.json({ value: { id: "user-test" } });
    });
    const provider = new DextCommerceHttpProvider({
      token: "sandbox-secret",
      environment: "sandbox",
      fetchImplementation
    });
    await expect(provider.validateCredential()).resolves.toBeUndefined();
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("sends documented invoice filters and returns bounded pagination", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const url = new URL(requestUrl);
      expect(url.origin).toBe("https://api.greenback.com");
      expect(url.pathname).toBe("/v2/transactions");
      expect(url.searchParams.get("types")).toBe("invoice,bill");
      expect(url.searchParams.get("limit")).toBe("25");
      expect(url.searchParams.get("cursor")).toBe("next-page");
      expect(url.searchParams.get("query")).toBe("acme");
      expect(url.searchParams.get("account_ids")).toBe("account-a,account-b");
      return Response.json({
        pagination: { count: 1, total_count: 2, next: "page-2" },
        values: [
          {
            id: "invoice-1",
            type: "invoice",
            reference_id: "INV-1",
            currency_code: "gbp",
            totals: { grand: 125 }
          }
        ]
      });
    });
    const provider = new DextCommerceHttpProvider({
      token: "production-secret",
      environment: "production",
      fetchImplementation
    });
    await expect(
      provider.listInvoices({
        types: ["invoice", "bill"],
        limit: 25,
        cursor: "next-page",
        query: "acme",
        accountIds: ["account-a", "account-b"]
      })
    ).resolves.toMatchObject({
      count: 1,
      totalCount: 2,
      nextCursor: "page-2",
      transactions: [{ id: "invoice-1", type: "invoice" }]
    });
  });

  it("rejects undocumented hosts and non-invoice transaction fetches", async () => {
    expect(
      () =>
        new DextCommerceHttpProvider({
          token: "secret",
          environment: "production",
          baseUrl: "https://example.com"
        })
    ).toThrow(/documented Dext Commerce host/u);

    const provider = new DextCommerceHttpProvider({
      token: "secret",
      environment: "production",
      fetchImplementation: async () =>
        Response.json({ value: { id: "purchase-1", type: "purchase" } })
    });
    await expect(provider.getInvoice("purchase-1")).rejects.toMatchObject({
      code: "not_found"
    });
  });
});
