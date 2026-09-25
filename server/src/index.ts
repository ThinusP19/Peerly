import { createApp } from "./app.ts";
import { env } from "./config/env.ts";
import { closePool } from "./db/pool.ts";

const app = createApp();
const onListening = () => {
  console.log(
    `Peerly API listening on http://${env.host ?? "localhost"}:${env.port} (${env.nodeEnv})`,
  );
};
const server = env.host
  ? app.listen(env.port, env.host, onListening)
  : app.listen(env.port, onListening);

/** Finish in-flight requests before exiting, so a deploy cannot truncate a submission. */
const shutdown = (signal: string) => async () => {
  console.log(`\n${signal} received, shutting down.`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGINT", shutdown("SIGINT"));
process.on("SIGTERM", shutdown("SIGTERM"));
