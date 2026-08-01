import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createMcpServer } from "../mcp/create-server.js";
import {
  createPluginFixtureDependencies,
  PluginFixtureAuth
} from "./dependencies.js";

const dependencies = createPluginFixtureDependencies();
const server = createMcpServer(dependencies, PluginFixtureAuth);
const transport = new StdioServerTransport();
let closing = false;

async function close(exitCode: number): Promise<void> {
  if (closing) {
    return;
  }
  closing = true;
  try {
    await server.close();
    await dependencies.close();
  } catch (error) {
    process.stderr.write(
      `Dext fixture plugin shutdown failed: ${String(error)}\n`
    );
    process.exitCode = 1;
    return;
  }
  process.exitCode = exitCode;
}

process.once("SIGINT", () => void close(0));
process.once("SIGTERM", () => void close(0));

try {
  await server.connect(transport);
} catch (error) {
  process.stderr.write(`Dext fixture plugin failed: ${String(error)}\n`);
  await close(1);
}
