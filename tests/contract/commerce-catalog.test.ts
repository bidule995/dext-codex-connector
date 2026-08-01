import { describe, expect, it } from "vitest";

import { CommerceEndpointCatalog } from "../../src/providers/dext-commerce/catalog.js";

describe("Dext Commerce endpoint catalog", () => {
  it("captures all 33 researched contracts without registering live tools", () => {
    expect(CommerceEndpointCatalog).toHaveLength(33);
    expect(new Set(CommerceEndpointCatalog.map(({ name }) => name)).size).toBe(
      33
    );
  });

  it("marks both deletion contracts destructive", () => {
    expect(
      CommerceEndpointCatalog.filter(({ destructive }) => destructive).map(
        ({ name }) => name
      )
    ).toEqual(["deleteAccount", "deleteTransactionExport"]);
  });
});
