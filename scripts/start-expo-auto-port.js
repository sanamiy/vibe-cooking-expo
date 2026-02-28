#!/usr/bin/env node

const net = require("node:net");
const { spawn } = require("node:child_process");

const DEFAULT_START_PORT = Number(process.env.EXPO_PORT_START || 8081);
const MAX_TRIES = Number(process.env.EXPO_PORT_TRIES || 50);

function parseCliArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { help: true, extraArgs: [] };
  }

  const separator = argv.indexOf("--");
  if (separator >= 0) {
    return { help: false, extraArgs: argv.slice(separator + 1) };
  }
  return { help: false, extraArgs: argv };
}

function printHelp() {
  console.log("Usage: node scripts/start-expo-auto-port.js -- [expo start args]");
  console.log("");
  console.log("Examples:");
  console.log("  npm run start");
  console.log("  npm run ios");
  console.log("  npm run start -- --tunnel");
  console.log("");
  console.log("Environment variables:");
  console.log("  EXPO_PORT_START  default: 8081");
  console.log("  EXPO_PORT_TRIES  default: 50");
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.on("error", () => {
      resolve(false);
    });

    server.listen({ port }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort, maxTries) {
  for (let i = 0; i < maxTries; i += 1) {
    const port = startPort + i;
    // eslint-disable-next-line no-await-in-loop
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return null;
}

async function main() {
  const { help, extraArgs } = parseCliArgs(process.argv.slice(2));

  if (help) {
    printHelp();
    return;
  }

  const selectedPort = await findAvailablePort(DEFAULT_START_PORT, MAX_TRIES);

  if (!selectedPort) {
    console.error(
      `[auto-port] Failed to find an available port in range ${DEFAULT_START_PORT}-${DEFAULT_START_PORT + MAX_TRIES - 1}`
    );
    process.exit(1);
  }

  console.log(`[auto-port] Using port ${selectedPort}`);

  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawn(
    npxCmd,
    ["expo", "start", "--port", String(selectedPort), ...extraArgs],
    { stdio: "inherit", env: process.env }
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error("[auto-port] Unexpected error:", error);
  process.exit(1);
});
