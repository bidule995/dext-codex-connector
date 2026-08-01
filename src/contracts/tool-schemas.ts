import { z } from "zod";

import {
  DextClientActivityStatsSchema,
  DextClientDetailSchema,
  DextClientSummarySchema
} from "./dext-health.js";

export const EmptyInputSchema = {};

export const SearchInputSchema = {
  query: z.string().trim().min(1).max(500)
};

export const FetchInputSchema = {
  id: z.string().trim().min(1).max(500)
};

export const ListClientsInputSchema = {
  query: z.string().trim().max(200).optional(),
  alertLevels: z.array(z.string().min(1).max(50)).max(10).optional(),
  limit: z.number().int().min(1).max(100).default(50)
};

export const ClientIdInputSchema = {
  clientId: z.string().trim().min(1).max(200)
};

export const SummarizePortfolioInputSchema = {
  alertLevels: z.array(z.string().min(1).max(50)).max(10).optional(),
  healthScoreBelow: z.number().int().min(0).max(100).optional()
};

export const FindHealthRisksInputSchema = {
  healthScoreAtOrBelow: z.number().int().min(0).max(100).default(60),
  alertLevels: z.array(z.string().min(1).max(50)).max(10).optional(),
  averageDebtorDaysAtOrAbove: z.number().min(0).optional(),
  debtorBalanceAtOrAbove: z.number().min(0).optional(),
  requireHmrcConnected: z.boolean().default(false),
  manualFeedsAtOrAbove: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(50).default(25),
  cursor: z.string().trim().min(1).max(2_000).optional()
};

export const CompareClientsInputSchema = {
  clientIds: z.array(z.string().trim().min(1).max(200)).min(2).max(20)
};

export const SnapshotHealthInputSchema = {
  snapshotKey: z.string().trim().min(1).max(100).optional()
};

export const CompareSnapshotsInputSchema = {
  earlierSnapshotId: z.string().trim().min(1).max(200),
  laterSnapshotId: z.string().trim().min(1).max(200)
};

export const ConnectionStatusOutputSchema = {
  providerMode: z.enum(["fixture", "live", "disabled"]),
  liveDextRequestsEnabled: z.boolean(),
  modules: z.record(z.string(), z.unknown())
};

export const CapabilitiesOutputSchema = {
  enabledTools: z.array(z.string()),
  disabledModules: z.record(z.string(), z.string())
};

export const ListClientsOutputSchema = {
  clients: z.array(DextClientSummarySchema),
  count: z.number().int().min(0),
  truncated: z.boolean(),
  asOf: z.string()
};

export const GetClientOutputSchema = {
  client: DextClientDetailSchema,
  asOf: z.string()
};

export const ClientActivityOutputSchema = {
  clientId: z.string(),
  activity: DextClientActivityStatsSchema,
  asOf: z.string()
};

export const PortfolioOutputSchema = {
  clientCount: z.number().int().min(0),
  averageHealthScore: z.number().nullable(),
  byAlertLevel: z.record(z.string(), z.number().int().min(0)),
  selectedClientCount: z.number().int().min(0),
  sampleClients: z.array(DextClientSummarySchema).max(20),
  sampleLimit: z.number().int().min(1).max(20),
  sampleTruncated: z.boolean(),
  formulaVersion: z.string(),
  asOf: z.string()
};

export const RiskOutputSchema = {
  matches: z.array(
    z.object({
      client: z.union([DextClientDetailSchema, DextClientSummarySchema]),
      reasons: z.array(z.string())
    })
  ),
  scanned: z.number().int().min(0),
  summaryScanned: z.number().int().min(0),
  detailScanned: z.number().int().min(0),
  totalCandidates: z.number().int().min(0),
  complete: z.boolean(),
  nextCursor: z.string().optional(),
  truncated: z.boolean(),
  formulaVersion: z.string(),
  asOf: z.string()
};

export const CompareClientsOutputSchema = {
  clients: z.array(
    z.object({
      client: DextClientDetailSchema,
      activity: DextClientActivityStatsSchema
    })
  ),
  formulaVersion: z.string(),
  asOf: z.string()
};

export const SnapshotOutputSchema = {
  id: z.string(),
  snapshotKey: z.string(),
  asOf: z.string(),
  formulaVersion: z.string(),
  clientCount: z.number().int().min(0)
};

export const CompareSnapshotsOutputSchema = {
  earlierSnapshotId: z.string(),
  laterSnapshotId: z.string(),
  added: z.array(DextClientSummarySchema),
  removed: z.array(DextClientSummarySchema),
  changed: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      healthScoreBefore: z.number().int(),
      healthScoreAfter: z.number().int(),
      alertLevelBefore: z.string(),
      alertLevelAfter: z.string()
    })
  ),
  formulaVersion: z.string()
};
