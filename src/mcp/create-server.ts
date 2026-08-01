import type { AuthContext } from "../auth/types.js";
import type { AppDependencies } from "../dependencies.js";
import { CONNECTOR_VERSION } from "../version.js";
import { registerCoreTools } from "./register-core-tools.js";
import { registerCommerceTools } from "./register-commerce-tools.js";
import { registerHealthTools } from "./register-health-tools.js";
import { registerRecordTools } from "./register-record-tools.js";
import { CanonicalSecurityMcpServer } from "./security.js";

export function createMcpServer(
  dependencies: AppDependencies,
  auth: AuthContext
): CanonicalSecurityMcpServer {
  const server = new CanonicalSecurityMcpServer({
    name: "dext-codex-connector",
    version: CONNECTOR_VERSION
  }, {
    instructions:
      "Use search to find Dext records and fetch to retrieve one record. Use list_invoices only when the hosted deployment enables its reviewed Commerce provider. Never ask for Dext API keys, personal access tokens, passwords, banking credentials, session cookies, or two-factor codes in conversation; credentials belong only in the authenticated HTTPS connection API. Prepare remains unavailable until Dext supplies a first-party contract."
  });

  registerCoreTools(server, dependencies, auth);
  registerRecordTools(server, dependencies, auth);
  if (dependencies.health.providerMode !== "disabled") {
    registerHealthTools(server, dependencies, auth);
  }
  registerCommerceTools(server, dependencies, auth);

  return server;
}
