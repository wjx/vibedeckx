import { buildApplication, buildCommand, buildRouteMap } from "@stricli/core";
import { createSqliteStorage } from "./storage/sqlite.js";
import { createServer } from "./server.js";
import { DB_PATH, DEFAULT_PORT } from "./constants.js";
import open from "open";

const startCommand = buildCommand({
  parameters: {
    flags: {
      port: {
        kind: "parsed",
        parse: parseInt,
        brief: "Port to run the server on",
        optional: true,
      },
    },
  },
  func: async (flags: { port: number | undefined }) => {
    const port = flags.port ?? DEFAULT_PORT;

    console.log("Starting vibedeckx...");

    const storage = await createSqliteStorage(DB_PATH);
    const server = createServer({ storage });

    const url = await server.start(port);
    console.log(`Server running at ${url}`);

    // 打开浏览器
    await open(url);

    // 处理退出信号
    const cleanup = async () => {
      console.log("\nShutting down...");
      await server.close();
      storage.close();
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  },
  docs: {
    brief: "Start the vibedeckx server",
  },
});

const routes = buildRouteMap({
  routes: {
    start: startCommand,
  },
  defaultCommand: "start",
  docs: {
    brief: "Vibedeckx - AI-powered app generator",
  },
});

export const program = buildApplication(routes, {
  name: "vibedeckx",
  versionInfo: {
    currentVersion: "0.1.0",
  },
});
