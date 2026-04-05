#!/usr/bin/env node

import { spawn } from "child_process";
import { createRequire } from "module";
import { resolve, dirname } from "path";

const platform = process.platform;
const arch = process.arch;
const packageName = `@vibedeckx/${platform}-${arch}`;

let binPath;
try {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  binPath = resolve(dirname(packageJsonPath), "dist", "bin.js");
} catch {
  console.error(
    `Error: No prebuilt package found for ${platform}-${arch}.\n` +
    `Expected npm package: ${packageName}\n\n` +
    `Supported platforms:\n` +
    `  - linux-x64\n` +
    `  - darwin-arm64\n` +
    `  - win32-x64\n\n` +
    `You can also download a standalone archive from the GitHub Releases page.`
  );
  process.exit(1);
}

const child = spawn(process.execPath, [binPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

// Forward signals to the child process
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
