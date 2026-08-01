import { describe, expect, it } from "vitest";

import type {
  DextClientActivityStats,
  DextClientDetail,
  DextClientSummary
} from "../../src/contracts/dext-health.js";
import { FixtureDextHealthProvider } from "../../src/providers/dext-health/fixture-provider.js";
import type { DextHealthProvider } from "../../src/providers/dext-health/provider.js";
import { StaticDextHealthProviderResolver } from "../../src/connections/provider-resolver.js";
import { CursorService } from "../../src/services/cursor-service.js";
import { HealthService } from "../../src/services/health-service.js";
import { PermalinkService } from "../../src/services/permalink-service.js";
import {
  InMemoryPermalinkRepository,
  InMemorySnapshotRepository
} from "../../src/storage/repositories.js";

function createService(
  provider: DextHealthProvider = new FixtureDextHealthProvider(),
  detailBudget = 40,
  tenantProviders: ReadonlyMap<string, DextHealthProvider> = new Map()
): HealthService {
  return new HealthService(
    new StaticDextHealthProviderResolver(provider, tenantProviders),
    new InMemorySnapshotRepository(),
    new PermalinkService(
      "http://localhost:3000",
      new InMemoryPermalinkRepository()
    ),
    new CursorService("test-cursor-encryption-key-at-least-32-bytes"),
    detailBudget,
    () => new Date("2026-07-29T10:00:00.000Z")
  );
}

class CountingProvider implements DextHealthProvider {
  readonly mode = "fixture" as const;
  readonly clients: DextClientSummary[];
  listCalls = 0;
  detailCalls = 0;

  constructor(count: number, prefix = "Client") {
    this.clients = Array.from({ length: count }, (_, index) => ({
      id: `${prefix.toLocaleLowerCase()}-${index.toString().padStart(4, "0")}`,
      name: `${prefix} ${index}`,
      practiceCode: null,
      providerId: `provider-${index}`,
      healthScore: index % 101,
      alertLevel: index % 2 === 0 ? "warning" : "success"
    }));
  }

  async listClients(): Promise<DextClientSummary[]> {
    this.listCalls += 1;
    return structuredClone(this.clients);
  }

  async getClient(clientId: string): Promise<DextClientDetail> {
    this.detailCalls += 1;
    const summary = this.clients.find(({ id }) => id === clientId)!;
    return {
      ...summary,
      organisationType: null,
      companyNumber: null,
      hmrcStatus: "NOT_CONNECTED",
      yearEnd: null,
      vatDetails: null,
      metrics: {
        debtorBalance: 1_000,
        avgDebtorDays: 45,
        oneDayImpact: null
      },
      bankReconciliation: { bankAccounts: 1, manualFeeds: 1 }
    };
  }

  async getClientActivityStats(): Promise<DextClientActivityStats> {
    const period = {
      start: null,
      end: null,
      turnover: null,
      salesCount: null,
      billsCount: null,
      creditsCount: null,
      manualJournalsCount: null,
      bankTransactionsCount: null,
      totalCount: null
    };
    return {
      annual: period,
      monthlyAverage: period,
      quarterlyAverage: period
    };
  }
}

describe("HealthService", () => {
  it("filters the fictional portfolio and calculates stable aggregates", async () => {
    const service = createService();
    const listed = await service.listClients("tenant-a", "user-a", {
      query: "harbor",
      limit: 10
    });
    expect(listed.clients.map((client) => client.id)).toEqual([
      "fixture-harbor"
    ]);

    const summary = await service.summarizePortfolio("tenant-a", "user-a", {
      healthScoreBelow: 60
    });
    expect(summary.clientCount).toBe(2);
    expect(summary.averageHealthScore).toBe(44);
    expect(summary.byAlertLevel).toEqual({ warning: 1, danger: 1 });
  });

  it("finds risk reasons using only explicit thresholds", async () => {
    const result = await createService().findRisks("tenant-a", "user-a", {
      healthScoreAtOrBelow: 40,
      requireHmrcConnected: true,
      averageDebtorDaysAtOrAbove: 100,
      limit: 10
    });
    const orchard = result.matches.find(
      ({ client }) => client.id === "fixture-orchard"
    );
    expect(orchard?.reasons).toEqual([
      "health_score<=40",
      "average_debtor_days>=100",
      "hmrc_not_connected"
    ]);
  });

  it("looks one match ahead before marking a bounded risk result truncated", async () => {
    const result = await createService().findRisks("tenant-a", "user-a", {
      healthScoreAtOrBelow: 100,
      requireHmrcConnected: false,
      limit: 1
    });
    expect(result.matches).toHaveLength(1);
    expect(result.scanned).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it("creates tenant-scoped, idempotent snapshots", async () => {
    const service = createService();
    const first = await service.takeSnapshot(
      "tenant-a",
      "user-a",
      "month-end"
    );
    const second = await service.takeSnapshot(
      "tenant-a",
      "user-a",
      "month-end"
    );
    expect(second.id).toBe(first.id);
    await expect(
      service.compareSnapshots("tenant-b", "user-a", first.id, second.id)
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      service.compareSnapshots("tenant-a", "user-b", first.id, second.id)
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("scans large summary-only portfolios without detail fan-out", async () => {
    const provider = new CountingProvider(200);
    const result = await createService(provider).findRisks(
      "tenant-a",
      "user-a",
      {
      healthScoreAtOrBelow: 100,
      requireHmrcConnected: false,
      limit: 50
      }
    );
    expect(provider.listCalls).toBe(1);
    expect(provider.detailCalls).toBe(0);
    expect(result.detailScanned).toBe(0);
    expect(result.matches).toHaveLength(50);
    expect(result.complete).toBe(false);
    expect(result.nextCursor).toBeTypeOf("string");
  });

  it("caps detail scans and binds continuations to the tenant", async () => {
    const provider = new CountingProvider(61);
    const service = createService(provider, 40);
    const first = await service.findRisks("tenant-a", "user-a", {
      healthScoreAtOrBelow: 0,
      requireHmrcConnected: true,
      limit: 50
    });
    expect(first.detailScanned).toBe(40);
    expect(first.complete).toBe(false);
    expect(provider.detailCalls).toBe(40);
    const cursor = first.nextCursor;
    if (!cursor) {
      throw new Error("Expected a continuation cursor.");
    }
    await expect(
      service.findRisks("tenant-b", "user-a", {
        healthScoreAtOrBelow: 0,
        requireHmrcConnected: true,
        limit: 50,
        cursor
      })
    ).rejects.toMatchObject({ code: "invalid_input" });
    const second = await service.findRisks("tenant-a", "user-a", {
      healthScoreAtOrBelow: 0,
      requireHmrcConnected: true,
      limit: 50,
      cursor
    });
    expect(second.detailScanned).toBe(21);
    expect(second.complete).toBe(true);
    expect(provider.detailCalls).toBe(61);
  });

  it("keeps portfolio samples and encoded results bounded", async () => {
    const summary = await createService(
      new CountingProvider(1_000)
    ).summarizePortfolio("tenant-a", "user-a", {});
    expect(summary.clientCount).toBe(1_000);
    expect(summary.sampleClients).toHaveLength(20);
    expect(summary.sampleTruncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(summary), "utf8")).toBeLessThan(
      64 * 1024
    );
  });

  it("resolves fixture providers by authenticated tenant", async () => {
    const tenantA = new CountingProvider(1, "Alpha");
    const tenantB = new CountingProvider(1, "Beta");
    const service = createService(
      tenantA,
      40,
      new Map([["tenant-b", tenantB]])
    );
    const a = await service.search("tenant-a", "user-a", "alpha");
    const b = await service.search("tenant-b", "user-a", "beta");
    expect(a[0]?.title).toBe("Alpha 0");
    expect(b[0]?.title).toBe("Beta 0");
    expect(await service.search("tenant-a", "user-a", "beta")).toEqual([]);
  });
});
