import type { DextCommerceProviderResolver } from "../connections/commerce-provider-resolver.js";
import type { DextCommerceTransaction } from "../contracts/dext-commerce.js";
import { ConnectorError, ConnectorErrorCode } from "../errors.js";
import type { PermalinkService } from "./permalink-service.js";
import type { FetchResult, SearchResult } from "./health-service.js";

const CommerceInvoicePrefix = "dext:commerce:invoice:";

export interface ListInvoicesOptions {
  direction: "sales" | "purchases" | "all";
  limit: number;
  cursor?: string;
  query?: string;
  accountIds?: string[];
  minTransactedAt?: string;
  maxTransactedAt?: string;
}

export class CommerceService {
  constructor(
    private readonly providers: DextCommerceProviderResolver,
    private readonly permalinks: PermalinkService,
    private readonly now: () => Date = () => new Date()
  ) {}

  async listInvoices(
    tenantId: string,
    userId: string,
    options: ListInvoicesOptions
  ) {
    const { provider } = await this.providers.resolve(tenantId, userId);
    const page = await provider.listInvoices({
      types: this.typesForDirection(options.direction),
      limit: options.limit,
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      ...(options.query === undefined ? {} : { query: options.query }),
      ...(options.accountIds === undefined
        ? {}
        : { accountIds: options.accountIds }),
      ...(options.minTransactedAt === undefined
        ? {}
        : { minTransactedAt: options.minTransactedAt }),
      ...(options.maxTransactedAt === undefined
        ? {}
        : { maxTransactedAt: options.maxTransactedAt })
    });
    return { ...page, asOf: this.now().toISOString() };
  }

  async getInvoice(
    tenantId: string,
    userId: string,
    transactionId: string
  ): Promise<{ invoice: DextCommerceTransaction; asOf: string }> {
    const { provider } = await this.providers.resolve(tenantId, userId);
    return {
      invoice: await provider.getInvoice(transactionId),
      asOf: this.now().toISOString()
    };
  }

  async search(
    tenantId: string,
    userId: string,
    query: string
  ): Promise<SearchResult[]> {
    const { provider, connectionId } = await this.providers.resolve(
      tenantId,
      userId
    );
    const page = await provider.listInvoices({
      types: ["invoice", "bill"],
      limit: 50,
      query
    });
    return Promise.all(
      page.transactions.map(async (transaction) => {
        const id = `${CommerceInvoicePrefix}${transaction.id}`;
        return {
          id,
          title: this.title(transaction),
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
    if (!id.startsWith(CommerceInvoicePrefix)) {
      throw new ConnectorError({
        code: ConnectorErrorCode.UnsupportedCapability,
        message: `The record type in ${id} is not a Commerce invoice.`
      });
    }
    const transactionId = id.slice(CommerceInvoicePrefix.length);
    if (!transactionId) {
      throw new ConnectorError({
        code: ConnectorErrorCode.InvalidInput,
        message: "The Dext Commerce invoice record ID is incomplete."
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
    const transaction = await provider.getInvoice(transactionId);
    const asOf = this.now().toISOString();
    return {
      id,
      title: this.title(transaction),
      text: this.text(transaction, asOf),
      url: await this.permalinks.create(
        tenantId,
        userId,
        connectionId,
        id
      ),
      metadata: {
        module: "commerce",
        kind: transaction.type,
        transactionId,
        direction: transaction.type === "invoice" ? "sales" : "purchases",
        asOf,
        providerMode: provider.mode
      }
    };
  }

  supportsRecord(id: string): boolean {
    return id.startsWith(CommerceInvoicePrefix);
  }

  private typesForDirection(
    direction: ListInvoicesOptions["direction"]
  ): Array<"invoice" | "bill"> {
    if (direction === "sales") return ["invoice"];
    if (direction === "purchases") return ["bill"];
    return ["invoice", "bill"];
  }

  private title(transaction: DextCommerceTransaction): string {
    const noun = transaction.type === "bill" ? "Bill" : "Invoice";
    return `${noun} ${transaction.reference_id ?? transaction.id}`;
  }

  private text(transaction: DextCommerceTransaction, asOf: string): string {
    const itemLines = (transaction.items ?? []).slice(0, 50).map((item) =>
      `- ${item.name ?? "Item"}: ${item.amount ?? "unknown"}`
    );
    return [
      this.title(transaction),
      `As of: ${asOf}`,
      `Transaction ID: ${transaction.id}`,
      `Direction: ${transaction.type === "invoice" ? "sales" : "purchases"}`,
      `Account ID: ${transaction.account_id ?? "unknown"}`,
      `Transaction date: ${transaction.transacted_at ?? "unknown"}`,
      `Currency: ${transaction.currency_code ?? "unknown"}`,
      `Grand total: ${transaction.totals?.grand ?? "unknown"}`,
      ...(itemLines.length === 0 ? [] : ["Items:", ...itemLines])
    ].join("\n");
  }
}
