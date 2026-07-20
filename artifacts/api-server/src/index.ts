import app from "./app";
import { logger } from "./lib/logger";
import { registry } from "./core/protocolRegistry.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  logger.info({ port }, "Server listening");

  // Initialize the protocol registry in the background. The registry is also
  // lazily re-initialized on the first /transactions/classify call if this
  // fails (e.g. DB not yet reachable at startup).
  registry.initialize()
    .then(() => {
      logger.info({ adapters: registry.adapterCount }, "Protocol registry initialized");
    })
    .catch((err) => {
      logger.warn({ err }, "Protocol registry initialization failed at startup — will retry on first classify call");
    });
});
