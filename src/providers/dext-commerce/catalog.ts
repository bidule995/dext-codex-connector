export type CommerceHttpMethod = "GET" | "POST" | "DELETE";

export interface CommerceEndpointContract {
  name: string;
  method: CommerceHttpMethod;
  path: string;
  mutates: boolean;
  destructive: boolean;
}

export const CommerceEndpointCatalog: readonly CommerceEndpointContract[] = [
  { name: "getCurrentUser", method: "GET", path: "/v2/users/me", mutates: false, destructive: false },
  { name: "createVision", method: "POST", path: "/v2/visions", mutates: true, destructive: false },
  { name: "getVision", method: "GET", path: "/v2/visions/{vision_id}", mutates: false, destructive: false },
  { name: "getVisionAttachment", method: "GET", path: "/v2/visions/{vision_id}/attachments/{attachment_id}", mutates: false, destructive: false },
  { name: "getVisionRasterized", method: "GET", path: "/v2/visions/{vision_id}/rasterized", mutates: false, destructive: false },
  { name: "getVisionAnnotated", method: "GET", path: "/v2/visions/{vision_id}/annotated", mutates: false, destructive: false },
  { name: "createMessage", method: "POST", path: "/v2/messages", mutates: true, destructive: false },
  { name: "getMessage", method: "GET", path: "/v2/messages/{message_id}", mutates: false, destructive: false },
  { name: "getMessageAttachment", method: "GET", path: "/v2/messages/{message_id}/attachments/{attachment_id}", mutates: false, destructive: false },
  { name: "getMessageHtml", method: "GET", path: "/v2/messages/{message_id}/html", mutates: false, destructive: false },
  { name: "getMessagePdf", method: "GET", path: "/v2/messages/{message_id}/pdf", mutates: false, destructive: false },
  { name: "listConnects", method: "GET", path: "/v2/connects", mutates: false, destructive: false },
  { name: "getConnect", method: "GET", path: "/v2/connects/{connect_label}", mutates: false, destructive: false },
  { name: "beginConnectIntent", method: "GET", path: "/v2/connects/{connect_label}/begin", mutates: true, destructive: false },
  { name: "reconnectAccountIntent", method: "GET", path: "/v2/accounts/{account_id}/reconnect", mutates: true, destructive: false },
  { name: "authorizeConnectIntent", method: "POST", path: "/v2/connect_intents/{token}", mutates: true, destructive: false },
  { name: "completeConnectIntent", method: "POST", path: "/v2/connect_intents/{token}/complete", mutates: true, destructive: false },
  { name: "createAccount", method: "POST", path: "/v2/accounts", mutates: true, destructive: false },
  { name: "listAccounts", method: "GET", path: "/v2/accounts", mutates: false, destructive: false },
  { name: "getAccount", method: "GET", path: "/v2/accounts/{account_id}", mutates: false, destructive: false },
  { name: "deleteAccount", method: "DELETE", path: "/v2/accounts/{account_id}", mutates: true, destructive: true },
  { name: "createSync", method: "POST", path: "/v2/accounts/{account_id}/syncs", mutates: true, destructive: false },
  { name: "getSync", method: "GET", path: "/v2/syncs/{sync_id}", mutates: false, destructive: false },
  { name: "createSyncInput", method: "POST", path: "/v2/syncs/{sync_id}/inputs", mutates: true, destructive: false },
  { name: "createTransaction", method: "POST", path: "/v2/transactions", mutates: true, destructive: false },
  { name: "updateTransaction", method: "POST", path: "/v2/transactions/{transaction_id}", mutates: true, destructive: false },
  { name: "listTransactions", method: "GET", path: "/v2/transactions", mutates: false, destructive: false },
  { name: "getTransaction", method: "GET", path: "/v2/transactions/{transaction_id}", mutates: false, destructive: false },
  { name: "getTransactionAttachment", method: "GET", path: "/v2/transactions/{transaction_id}/attachments/{attachment_id}", mutates: false, destructive: false },
  { name: "getTransactionExportIntent", method: "GET", path: "/v2/transactions/{transaction_id}/exporters/{account_id}", mutates: false, destructive: false },
  { name: "applyTransactionExportIntent", method: "POST", path: "/v2/transactions/{transaction_id}/exporters/{account_id}", mutates: true, destructive: false },
  { name: "getTransactionExport", method: "GET", path: "/v2/transaction_exports/{transaction_id}", mutates: false, destructive: false },
  { name: "deleteTransactionExport", method: "DELETE", path: "/v2/transaction_exports/{transaction_id}", mutates: true, destructive: true }
] as const;
