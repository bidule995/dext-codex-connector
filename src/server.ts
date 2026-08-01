import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = buildApp(config);

try {
  await app.listen({ host: config.HOST, port: config.PORT });
  process.stdout.write(
    `Dext Codex Connector listening on ${config.HOST}:${config.PORT} in ${config.DEXT_DATA_SOURCE} mode.\n`
  );
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
