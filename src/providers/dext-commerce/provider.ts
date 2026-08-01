import type {
  DextCommercePage,
  DextCommerceTransaction
} from "../../contracts/dext-commerce.js";

export interface ListCommerceInvoicesOptions {
  types: Array<"invoice" | "bill">;
  limit: number;
  cursor?: string;
  query?: string;
  accountIds?: string[];
  minTransactedAt?: string;
  maxTransactedAt?: string;
}

export interface DextCommerceProvider {
  readonly mode: "live";
  validateCredential(): Promise<void>;
  listInvoices(options: ListCommerceInvoicesOptions): Promise<DextCommercePage>;
  getInvoice(transactionId: string): Promise<DextCommerceTransaction>;
}
