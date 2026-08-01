import type {
  DextClientActivityStats,
  DextClientDetail,
  DextClientSummary
} from "../../contracts/dext-health.js";
import { ConnectorError, ConnectorErrorCode } from "../../errors.js";
import type { DextHealthProvider } from "./provider.js";

const clients: DextClientSummary[] = [
  {
    id: "fixture-northstar",
    name: "Northstar Studio Ltd",
    practiceCode: "FIX-001",
    providerId: "fixture-provider-1",
    healthScore: 84,
    alertLevel: "success"
  },
  {
    id: "fixture-harbor",
    name: "Harbor Goods Ltd",
    practiceCode: "FIX-002",
    providerId: "fixture-provider-2",
    healthScore: 57,
    alertLevel: "warning"
  },
  {
    id: "fixture-orchard",
    name: "Orchard Labs Ltd",
    practiceCode: null,
    providerId: "fixture-provider-3",
    healthScore: 31,
    alertLevel: "danger"
  }
];

const details: Record<string, DextClientDetail> = {
  "fixture-northstar": {
    ...clients[0]!,
    organisationType: "COMPANY",
    companyNumber: "FIXTURE-1001",
    hmrcStatus: "CONNECTED",
    yearEnd: "2026-12-31",
    vatDetails: {
      scheme: "ACCRUAL",
      number: "GB FIXTURE 001",
      reportingCycle: "QUARTERLY",
      periodStart: "2026-04-01",
      periodEnd: "2026-06-30"
    },
    metrics: {
      debtorBalance: 1_250,
      avgDebtorDays: 21,
      oneDayImpact: 59.52
    },
    bankReconciliation: {
      bankAccounts: 2,
      manualFeeds: 0
    }
  },
  "fixture-harbor": {
    ...clients[1]!,
    organisationType: "COMPANY",
    companyNumber: "FIXTURE-1002",
    hmrcStatus: "NOT_CONNECTED",
    yearEnd: "2026-09-30",
    vatDetails: null,
    metrics: {
      debtorBalance: 8_420.5,
      avgDebtorDays: 68,
      oneDayImpact: 123.83
    },
    bankReconciliation: {
      bankAccounts: 3,
      manualFeeds: 1
    }
  },
  "fixture-orchard": {
    ...clients[2]!,
    organisationType: "COMPANY",
    companyNumber: null,
    hmrcStatus: "NOT_CONNECTED",
    yearEnd: null,
    vatDetails: null,
    metrics: {
      debtorBalance: 15_700,
      avgDebtorDays: 112,
      oneDayImpact: 140.18
    },
    bankReconciliation: {
      bankAccounts: 1,
      manualFeeds: 1
    }
  }
};

function activityFor(turnover: number): DextClientActivityStats {
  const base = {
    start: "2025-07-01",
    end: "2026-06-30",
    turnover,
    salesCount: 48,
    billsCount: 72,
    creditsCount: 4,
    manualJournalsCount: 3,
    bankTransactionsCount: 520,
    totalCount: 647,
    turnoverChangeYoY: 8.4,
    salesChangeYoY: 6.7,
    billsChangeYoY: 4.3,
    creditsChangeYoY: 0,
    manualJournalsChangeYoY: -25,
    bankTransactionsChangeYoY: 10.2,
    totalChangeYoY: 8.9
  };
  return {
    annual: base,
    monthlyAverage: {
      ...base,
      turnover: Number((turnover / 12).toFixed(2)),
      salesCount: 4,
      billsCount: 6,
      creditsCount: 0.33,
      manualJournalsCount: 0.25,
      bankTransactionsCount: 43.33,
      totalCount: 53.92
    },
    quarterlyAverage: {
      ...base,
      start: "2026-04-01",
      turnover: Number((turnover / 4).toFixed(2)),
      salesCount: 12,
      billsCount: 18,
      creditsCount: 1,
      manualJournalsCount: 0.75,
      bankTransactionsCount: 130,
      totalCount: 161.75,
      turnoverChangeMoM: 1.5,
      salesChangeMoM: 0,
      billsChangeMoM: 2.1,
      creditsChangeMoM: 0,
      manualJournalsChangeMoM: 0,
      bankTransactionsChangeMoM: 1.8,
      totalChangeMoM: 1.6
    }
  };
}

const activity: Record<string, DextClientActivityStats> = {
  "fixture-northstar": activityFor(182_000),
  "fixture-harbor": activityFor(96_000),
  "fixture-orchard": activityFor(54_000)
};

export class FixtureDextHealthProvider implements DextHealthProvider {
  readonly mode = "fixture" as const;

  async listClients(): Promise<DextClientSummary[]> {
    return structuredClone(clients);
  }

  async getClient(clientId: string): Promise<DextClientDetail> {
    const client = details[clientId];
    if (!client) {
      throw new ConnectorError({
        code: ConnectorErrorCode.NotFound,
        message: `Fixture client ${clientId} was not found.`
      });
    }
    return structuredClone(client);
  }

  async getClientActivityStats(
    clientId: string
  ): Promise<DextClientActivityStats> {
    const stats = activity[clientId];
    if (!stats) {
      throw new ConnectorError({
        code: ConnectorErrorCode.NotFound,
        message: `Fixture activity for ${clientId} was not found.`
      });
    }
    return structuredClone(stats);
  }
}
