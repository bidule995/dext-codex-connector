import type { AuthContext } from "../auth/types.js";
import type { AppDependencies } from "../dependencies.js";
import { CONNECTOR_VERSION } from "../version.js";
import { registerCoreTools } from "./register-core-tools.js";
import { registerHealthTools } from "./register-health-tools.js";
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
      "Use search to find Dext records and fetch to retrieve one record. Read current state before any future write or deletion. Never ask for Dext tokens, passwords, banking credentials, session cookies, or two-factor codes in conversation. Commerce and Prepare are unavailable until their provider gates pass."
  });

  registerCoreTools(server, dependencies, auth);
  if (dependencies.health.providerMode !== "disabled") {
    registerHealthTools(server, dependencies, auth);
  }

  return server;
}
