import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createMcpServer } from "../mcp/create-server.js";
import { createPluginLocalDependencies } from "./local-dependencies.js";

let closing = false;

try {
  const runtime = await createPluginLocalDependencies();
  const server = createMcpServer(runtime.dependencies, runtime.auth, {
    runtime: "local",
    securityMode: "noauth"
  });
  const transport = new StdioServerTransport();

  async function close(exitCode: number): Promise<void> {
    if (closing) return;
    closing = true;
    try {
      await server.close();
      await runtime.dependencies.close();
    } catch {
      process.stderr.write("Dext local plugin shutdown failed.\n");
      process.exitCode = 1;
      return;
    }
    process.exitCode = exitCode;
  }

  process.once("SIGINT", () => void close(0));
  process.once("SIGTERM", () => void close(0));
  process.stdin.once("close", () => void close(0));
  await server.connect(transport);
  process.stderr.write(
    `Dext local MCP started in ${runtime.config.mode === "live" ? "live" : "disabled"} mode.\n`
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error.";
  process.stderr.write(`Dext local plugin failed: ${message}\n`);
  process.exitCode = 1;
}
