import { createHash } from "node:crypto";

import type { DextHealthProviderResolver } from "../connections/provider-resolver.js";
import type {
  DextClientActivityStats,
  DextClientDetail,
  DextClientSummary
} from "../contracts/dext-health.js";
import { ConnectorError, ConnectorErrorCode } from "../errors.js";
import type {
  SnapshotRepository
} from "../storage/repositories.js";
import type { CursorService } from "./cursor-service.js";
import type { PermalinkService } from "./permalink-service.js";

const FormulaVersion = "health-v1";
const HealthClientPrefix = "dext:health:client:";
const PortfolioSampleLimit = 20;
const PortfolioResultByteLimit = 64 * 1024;

export interface ListClientsOptions {
  query?: string;
  alertLevels?: string[];
  limit: number;
}

export interface PortfolioOptions {
  alertLevels?: string[];
  healthScoreBelow?: number;
}

export interface RiskOptions {
  healthScoreAtOrBelow: number;
  alertLevels?: string[];
  averageDebtorDaysAtOrAbove?: number;
  debtorBalanceAtOrAbove?: number;
  requireHmrcConnected: boolean;
  manualFeedsAtOrAbove?: number;
  limit: number;
  cursor?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  url: string;
}

export interface FetchResult {
  id: string;
  title: string;
  text: string;
  url: string;
  metadata: Record<string, string | number | boolean | null>;
}

type RiskClient = DextClientSummary | DextClientDetail;

export class HealthService {
  constructor(
    private readonly providers: DextHealthProviderResolver,
    private readonly snapshots: SnapshotRepository,
    private readonly permalinks: PermalinkService,
    private readonly cursors: CursorService,
    private readonly detailRequestBudget: number,
    private readonly now: () => Date = () => new Date()
  ) {}

  get providerMode(): DextHealthProviderResolver["configuredMode"] {
    return this.providers.configuredMode;
  }

  async connectionStatus(tenantId: string, userId: string): Promise<{
    enabled: boolean;
    mode: DextHealthProviderResolver["configuredMode"];
  }> {
    const resolved = await this.providers.resolve(tenantId, userId);
    return { enabled: resolved.provider.mode !== "disabled", mode: resolved.provider.mode };
  }

  async listClients(
    tenantId: string,
    userId: string,
    options: ListClientsOptions
  ): Promise<{
    clients: DextClientSummary[];
    count: number;
    truncated: boolean;
    asOf: string;
  }> {
    const { provider } = await this.providers.resolve(tenantId, userId);
    let clients = await provider.listClients();
    if (options.query) {
      const query = options.query.toLocaleLowerCase();
      clients = clients.filter((client) =>
        [client.name, client.id, client.practiceCode, client.providerId]
          .filter((value): value is string => typeof value === "string")
          .some((value) => value.toLocaleLowerCase().includes(query))
      );
    }
    if (options.alertLevels?.length) {
      const levels = new Set(
        options.alertLevels.map((level) => level.toLocaleLowerCase())
      );
      clients = clients.filter((client) =>
        levels.has(client.alertLevel.toLocaleLowerCase())
      );
    }
    clients.sort((left, right) => left.name.localeCompare(right.name));
    const count = clients.length;
    return {
      clients: clients.slice(0, options.limit),
      count,
      truncated: count > options.limit,
      asOf: this.now().toISOString()
    };
  }

  async getClient(tenantId: string, userId: string, clientId: string): Promise<{
    client: DextClientDetail;
    asOf: string;
  }> {
    const { provider } = await this.providers.resolve(tenantId, userId);
    return {
      client: await provider.getClient(clientId),
      asOf: this.now().toISOString()
    };
  }

  async getClientActivityStats(
    tenantId: string,
    userId: string,
    clientId: string
  ): Promise<{
    clientId: string;
    activity: DextClientActivityStats;
    asOf: string;
  }> {
    const { provider } = await this.providers.resolve(tenantId, userId);
    return {
      clientId,
      activity: await provider.getClientActivityStats(clientId),
      asOf: this.now().toISOString()
    };
  }

  async summarizePortfolio(
    tenantId: string,
    userId: string,
    options: PortfolioOptions
  ): Promise<{
    clientCount: number;
    averageHealthScore: number | null;
    byAlertLevel: Record<string, number>;
    selectedClientCount: number;
    sampleClients: DextClientSummary[];
    sampleLimit: number;
    sampleTruncated: boolean;
    formulaVersion: string;
    asOf: string;
  }> {
    const { provider } = await this.providers.resolve(tenantId, userId);
    let clients = await provider.listClients();
    if (options.alertLevels?.length) {
      const levels = new Set(
        options.alertLevels.map((level) => level.toLocaleLowerCase())
      );
      clients = clients.filter((client) =>
        levels.has(client.alertLevel.toLocaleLowerCase())
      );
    }
    if (options.healthScoreBelow !== undefined) {
      clients = clients.filter(
        (client) => client.healthScore < options.healthScoreBelow!
      );
    }

    const byAlertLevel: Record<string, number> = {};
    let scoreTotal = 0;
    for (const client of clients) {
      byAlertLevel[client.alertLevel] =
        (byAlertLevel[client.alertLevel] ?? 0) + 1;
      scoreTotal += client.healthScore;
    }

    const sampleClients = [...clients]
      .sort(
        (left, right) =>
          left.healthScore - right.healthScore || left.id.localeCompare(right.id)
      )
      .slice(0, PortfolioSampleLimit);
    const result = {
      clientCount: clients.length,
      averageHealthScore:
        clients.length === 0
          ? null
          : Number((scoreTotal / clients.length).toFixed(2)),
      byAlertLevel,
      selectedClientCount: clients.length,
      sampleClients,
      sampleLimit: PortfolioSampleLimit,
      sampleTruncated: clients.length > sampleClients.length,
      formulaVersion: FormulaVersion,
      asOf: this.now().toISOString()
    };
    while (
      result.sampleClients.length > 0 &&
      Buffer.byteLength(JSON.stringify(result), "utf8") > PortfolioResultByteLimit
    ) {
      result.sampleClients.pop();
      result.sampleTruncated = true;
    }
    return result;
  }

  async findRisks(
    tenantId: string,
    userId: string,
    options: RiskOptions
  ): Promise<{
    matches: Array<{ client: RiskClient; reasons: string[] }>;
    scanned: number;
    summaryScanned: number;
    detailScanned: number;
    totalCandidates: number;
    complete: boolean;
    nextCursor?: string;
    truncated: boolean;
    formulaVersion: string;
    asOf: string;
  }> {
    const { provider, connectionId } = await this.providers.resolve(
      tenantId,
      userId
    );
    const summaries = (await provider.listClients()).sort((left, right) =>
      left.id.localeCompare(right.id)
    );
    const requestedAlertLevels = new Set(
      (options.alertLevels ?? []).map((level) => level.toLocaleLowerCase())
    );
    const detailRequired =
      options.averageDebtorDaysAtOrAbove !== undefined ||
      options.debtorBalanceAtOrAbove !== undefined ||
      options.requireHmrcConnected ||
      options.manualFeedsAtOrAbove !== undefined;
    const filterHash = this.riskFilterHash(options);
    let offset = 0;
    if (options.cursor) {
      const cursor = this.cursors.parse(options.cursor);
      if (
        cursor.tenantId !== tenantId ||
        cursor.connectionId !== connectionId ||
        cursor.filterHash !== filterHash ||
        cursor.offset > summaries.length
      ) {
        throw new ConnectorError({
          code: ConnectorErrorCode.InvalidInput,
          message: "The risk scan cursor does not match this tenant, connection, or filter."
        });
      }
      offset = cursor.offset;
    }

    const matches: Array<{ client: RiskClient; reasons: string[] }> = [];
    let processed = 0;
    let detailScanned = 0;
    const maxProcessed = detailRequired
      ? Math.min(this.detailRequestBudget, summaries.length - offset)
      : summaries.length - offset;

    for (let index = offset; index < summaries.length; index += 1) {
      if (processed >= maxProcessed || matches.length > options.limit) {
        break;
      }
      const summary = summaries[index]!;
      processed += 1;
      const summaryReasons = this.summaryRiskReasons(
        summary,
        options,
        requestedAlertLevels
      );
      if (!detailRequired) {
        if (summaryReasons.length > 0) {
          matches.push({ client: summary, reasons: summaryReasons });
        }
        continue;
      }

      const client = await provider.getClient(summary.id);
      detailScanned += 1;
      const reasons = [
        ...summaryReasons,
        ...this.detailRiskReasons(client, options)
      ];
      if (reasons.length > 0) {
        matches.push({ client, reasons });
      }
    }

    const nextOffset = offset + processed;
    const complete = nextOffset >= summaries.length;
    const truncated = matches.length > options.limit || !complete;
    return {
      matches: matches.slice(0, options.limit),
      scanned: processed,
      summaryScanned: processed,
      detailScanned,
      totalCandidates: summaries.length,
      complete,
      ...(complete
        ? {}
        : {
            nextCursor: this.cursors.create({
              tenantId,
              connectionId,
              filterHash,
              offset: nextOffset
            })
          }),
      truncated,
      formulaVersion: FormulaVersion,
      asOf: this.now().toISOString()
    };
  }

  async compareClients(
    tenantId: string,
    userId: string,
    clientIds: string[]
  ): Promise<{
    clients: Array<{
      client: DextClientDetail;
      activity: DextClientActivityStats;
    }>;
    formulaVersion: string;
    asOf: string;
  }> {
    const uniqueIds = [...new Set(clientIds)];
    if (uniqueIds.length !== clientIds.length) {
      throw new ConnectorError({
        code: ConnectorErrorCode.InvalidInput,
        message: "Client comparison requires unique client IDs."
      });
    }
    const { provider } = await this.providers.resolve(tenantId, userId);
    const clients = [];
    for (const clientId of uniqueIds) {
      clients.push({
        client: await provider.getClient(clientId),
        activity: await provider.getClientActivityStats(clientId)
      });
    }
    return {
      clients,
      formulaVersion: FormulaVersion,
      asOf: this.now().toISOString()
    };
  }

  async takeSnapshot(
    tenantId: string,
    userId: string,
    snapshotKey?: string
  ): Promise<{
    id: string;
    snapshotKey: string;
    asOf: string;
    formulaVersion: string;
    clientCount: number;
  }> {
    const asOf = this.now().toISOString();
    const { provider, connectionId } = await this.providers.resolve(
      tenantId,
      userId
    );
    const snapshot = await this.snapshots.create({
      tenantId,
      ownerUserId: userId,
      connectionId,
      snapshotKey: snapshotKey ?? asOf.slice(0, 10),
      asOf,
      formulaVersion: FormulaVersion,
      clients: await provider.listClients()
    });
    return {
      id: snapshot.id,
      snapshotKey: snapshot.snapshotKey,
      asOf: snapshot.asOf,
      formulaVersion: snapshot.formulaVersion,
      clientCount: snapshot.clients.length
    };
  }

  async compareSnapshots(
    tenantId: string,
    userId: string,
    earlierSnapshotId: string,
    laterSnapshotId: string
  ): Promise<{
    earlierSnapshotId: string;
    laterSnapshotId: string;
    added: DextClientSummary[];
    removed: DextClientSummary[];
    changed: Array<{
      id: string;
      name: string;
      healthScoreBefore: number;
      healthScoreAfter: number;
      alertLevelBefore: string;
      alertLevelAfter: string;
    }>;
    formulaVersion: string;
  }> {
    const earlier = await this.snapshots.get(
      tenantId,
      userId,
      earlierSnapshotId
    );
    const later = await this.snapshots.get(
      tenantId,
      userId,
      laterSnapshotId
    );
    const earlierById = new Map(earlier.clients.map((client) => [client.id, client]));
    const laterById = new Map(later.clients.map((client) => [client.id, client]));
    const added = later.clients.filter((client) => !earlierById.has(client.id));
    const removed = earlier.clients.filter((client) => !laterById.has(client.id));
    const changed = [];
    for (const current of later.clients) {
      const previous = earlierById.get(current.id);
      if (
        previous &&
        (previous.healthScore !== current.healthScore ||
          previous.alertLevel !== current.alertLevel)
      ) {
        changed.push({
          id: current.id,
          name: current.name,
          healthScoreBefore: previous.healthScore,
          healthScoreAfter: current.healthScore,
          alertLevelBefore: previous.alertLevel,
          alertLevelAfter: current.alertLevel
        });
      }
    }
    return {
      earlierSnapshotId,
      laterSnapshotId,
      added,
      removed,
      changed,
      formulaVersion: FormulaVersion
    };
  }

  async search(
    tenantId: string,
    userId: string,
    query: string
  ): Promise<SearchResult[]> {
    const normalized = query.toLocaleLowerCase();
    const { provider, connectionId } = await this.providers.resolve(
      tenantId,
      userId
    );
    const clients = await provider.listClients();
    const matches = clients
      .filter((client) =>
        [client.name, client.id, client.practiceCode, client.alertLevel]
          .filter((value): value is string => typeof value === "string")
          .some((value) => value.toLocaleLowerCase().includes(normalized))
      )
      .slice(0, 50);
    return Promise.all(
      matches.map(async (client) => {
        const id = `${HealthClientPrefix}${client.id}`;
        return {
          id,
          title: client.name,
          url: await this.permalinks.create(
            tenantId,
            userId,
            connectionId,
            id
          )
        };
      })
    );
  }

  async fetchRecord(
    tenantId: string,
    userId: string,
    id: string,
    expectedConnectionId?: string
  ): Promise<FetchResult> {
    if (!id.startsWith(HealthClientPrefix)) {
      throw new ConnectorError({
        code: ConnectorErrorCode.UnsupportedCapability,
        message: `The record type in ${id} is not enabled.`
      });
    }
    const clientId = id.slice(HealthClientPrefix.length);
    if (!clientId) {
      throw new ConnectorError({
        code: ConnectorErrorCode.InvalidInput,
        message: "The Dext client record ID is incomplete."
      });
    }
    const { provider, connectionId } = await this.providers.resolve(
      tenantId,
      userId
    );
    if (expectedConnectionId && expectedConnectionId !== connectionId) {
      throw new ConnectorError({
        code: ConnectorErrorCode.NotFound,
        message: "The Dext record was not found."
      });
    }
    const [client, activity] = await Promise.all([
      provider.getClient(clientId),
      provider.getClientActivityStats(clientId)
    ]);
    const asOf = this.now().toISOString();
    return {
      id,
      title: client.name,
      text: [
        `Dext Data Health client: ${client.name}`,
        `As of: ${asOf}`,
        `Health score: ${client.healthScore}`,
        `Alert level: ${client.alertLevel}`,
        `HMRC status: ${client.hmrcStatus ?? "unknown"}`,
        `Year end: ${client.yearEnd ?? "unknown"}`,
        `Debtor balance: ${client.metrics?.debtorBalance ?? "unknown"}`,
        `Average debtor days: ${client.metrics?.avgDebtorDays ?? "unknown"}`,
        `Annual turnover: ${activity.annual.turnover ?? "unknown"}`,
        `Annual total activity count: ${activity.annual.totalCount ?? "unknown"}`
      ].join("\n"),
      url: await this.permalinks.create(
        tenantId,
        userId,
        connectionId,
        id
      ),
      metadata: {
        module: "data-health",
        kind: "client",
        clientId,
        asOf,
        providerMode: provider.mode
      }
    };
  }

  supportsRecord(id: string): boolean {
    return id.startsWith(HealthClientPrefix);
  }

  private summaryRiskReasons(
    client: DextClientSummary,
    options: RiskOptions,
    requestedAlertLevels: ReadonlySet<string>
  ): string[] {
    const reasons: string[] = [];
    if (client.healthScore <= options.healthScoreAtOrBelow) {
      reasons.push(`health_score<=${options.healthScoreAtOrBelow}`);
    }
    if (
      requestedAlertLevels.size > 0 &&
      requestedAlertLevels.has(client.alertLevel.toLocaleLowerCase())
    ) {
      reasons.push(`alert_level=${client.alertLevel}`);
    }
    return reasons;
  }

  private detailRiskReasons(
    client: DextClientDetail,
    options: RiskOptions
  ): string[] {
    const reasons: string[] = [];
    if (
      options.averageDebtorDaysAtOrAbove !== undefined &&
      client.metrics?.avgDebtorDays !== null &&
      client.metrics?.avgDebtorDays !== undefined &&
      client.metrics.avgDebtorDays >= options.averageDebtorDaysAtOrAbove
    ) {
      reasons.push(`average_debtor_days>=${options.averageDebtorDaysAtOrAbove}`);
    }
    if (
      options.debtorBalanceAtOrAbove !== undefined &&
      client.metrics?.debtorBalance !== null &&
      client.metrics?.debtorBalance !== undefined &&
      client.metrics.debtorBalance >= options.debtorBalanceAtOrAbove
    ) {
      reasons.push(`debtor_balance>=${options.debtorBalanceAtOrAbove}`);
    }
    if (options.requireHmrcConnected && client.hmrcStatus !== "CONNECTED") {
      reasons.push("hmrc_not_connected");
    }
    if (
      options.manualFeedsAtOrAbove !== undefined &&
      client.bankReconciliation?.manualFeeds !== null &&
      client.bankReconciliation?.manualFeeds !== undefined &&
      client.bankReconciliation.manualFeeds >= options.manualFeedsAtOrAbove
    ) {
      reasons.push(`manual_feeds>=${options.manualFeedsAtOrAbove}`);
    }
    return reasons;
  }

  private riskFilterHash(options: RiskOptions): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          healthScoreAtOrBelow: options.healthScoreAtOrBelow,
          alertLevels: [...(options.alertLevels ?? [])].sort(),
          averageDebtorDaysAtOrAbove: options.averageDebtorDaysAtOrAbove ?? null,
          debtorBalanceAtOrAbove: options.debtorBalanceAtOrAbove ?? null,
          requireHmrcConnected: options.requireHmrcConnected,
          manualFeedsAtOrAbove: options.manualFeedsAtOrAbove ?? null,
          limit: options.limit
        })
      )
      .digest("base64url");
  }
}
