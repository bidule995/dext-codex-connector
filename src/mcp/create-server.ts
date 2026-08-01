import type { AuthContext } from "../auth/types.js";
import type { AppDependencies } from "../dependencies.js";
import { CONNECTOR_VERSION } from "../version.js";
import { registerCoreTools } from "./register-core-tools.js";
import { registerCommerceTools } from "./register-commerce-tools.js";
import { registerHealthTools } from "./register-health-tools.js";
import { registerRecordTools } from "./register-record-tools.js";
import { CanonicalSecurityMcpServer } from "./security.js";
import type { ToolSecurityMode } from "./security.js";

export interface CreateMcpServerOptions {
  securityMode?: ToolSecurityMode;
  runtime?: "hosted" | "local";
}

export function createMcpServer(
  dependencies: AppDependencies,
  auth: AuthContext,
  options: CreateMcpServerOptions = {}
): CanonicalSecurityMcpServer {
  const securityMode = options.securityMode ?? "oauth";
  const local = options.runtime === "local";
  const server = new CanonicalSecurityMcpServer(
    {
      name: "dext-codex-connector",
      version: CONNECTOR_VERSION
    },
    {
      instructions: local
        ? "Use connection_status before Dext reads. Credentials are configured locally outside conversations. Never ask for API tokens, passwords, banking credentials, session cookies, or two-factor codes. Data Health and Commerce use separate credentials. Dext Prepare invoices and all Dext writes remain unavailable."
        : "Use search to find Dext records and fetch to retrieve one record. Use list_invoices only when the hosted deployment enables its reviewed Commerce provider. Never ask for Dext API keys, personal access tokens, passwords, banking credentials, session cookies, or two-factor codes in conversation; credentials belong only in the authenticated HTTPS connection API. Prepare remains unavailable until Dext supplies a first-party contract."
    }
  );

  registerCoreTools(server, dependencies, auth, securityMode);
  if (
    dependencies.health.providerMode !== "disabled" ||
    dependencies.commerce
  ) {
    registerRecordTools(server, dependencies, auth, securityMode);
  }
  if (dependencies.health.providerMode !== "disabled") {
    registerHealthTools(server, dependencies, auth, securityMode);
  }
  registerCommerceTools(server, dependencies, auth, securityMode);

  return server;
}
