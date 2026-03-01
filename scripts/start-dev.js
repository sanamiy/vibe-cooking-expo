#!/usr/bin/env node

/**
 * Development Startup Script
 *
 * Starts both frontend (Expo) and backend (VPS API) with auto port discovery.
 * Updates config files automatically.
 *
 * Usage:
 *   npm run dev           # Start both frontend and backend
 *   npm run dev -- --web  # Start with web flag
 */

const net = require("node:net");
const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.join(__dirname, "..");
const VPS_API_DIR = path.join(ROOT_DIR, "vps-api");
const CONFIG_PATH = path.join(ROOT_DIR, "config.json");
const ENV_PATH = path.join(ROOT_DIR, ".env");

// Port ranges
const EXPO_PORT_START = Number(process.env.EXPO_PORT_START || 8081);
const VPS_PORT_START = Number(process.env.VPS_PORT_START || 8080);
const MAX_TRIES = 50;

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function log(prefix, message, color = colors.cyan) {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`);
}

function logError(prefix, message) {
  console.error(`${colors.red}[${prefix}]${colors.reset} ${message}`);
}

// ─── Port Discovery ──────────────────────────────────

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen({ port }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort, maxTries, opts = {}) {
  const excluded = new Set(opts.excludePorts || []);
  for (let i = 0; i < maxTries; i++) {
    const port = startPort + i;
    if (excluded.has(port)) continue;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return null;
}

// ─── Config Management ───────────────────────────────

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

function readEnv() {
  try {
    const content = fs.readFileSync(ENV_PATH, "utf8");
    const env = {};
    for (const line of content.split("\n")) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        env[match[1]] = match[2];
      }
    }
    return env;
  } catch {
    return {};
  }
}

function writeEnv(env) {
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_PATH, lines.join("\n") + "\n");
}

function updateConfigForLocalDev(vpsPort) {
  const localVpsUrl = `http://localhost:${vpsPort}`;

  // Update config.json
  const config = readConfig();
  const hadApiMode = Object.prototype.hasOwnProperty.call(config, "apiMode");
  const originalApiMode = config.apiMode;
  config.apiMode = "vps_proxy";
  writeConfig(config);

  // Update .env
  const env = readEnv();
  const hadVpsUrlInEnv = Object.prototype.hasOwnProperty.call(
    env,
    "EXPO_PUBLIC_VPS_API_BASE_URL",
  );
  const originalVpsUrlInEnv = env.EXPO_PUBLIC_VPS_API_BASE_URL;
  env.EXPO_PUBLIC_VPS_API_BASE_URL = localVpsUrl;
  writeEnv(env);

  // Ensure child processes inherit local API base URL even if shell env had another value.
  const hadVpsUrlInProcessEnv = Object.prototype.hasOwnProperty.call(
    process.env,
    "EXPO_PUBLIC_VPS_API_BASE_URL",
  );
  const originalVpsUrlInProcessEnv = process.env.EXPO_PUBLIC_VPS_API_BASE_URL;
  process.env.EXPO_PUBLIC_VPS_API_BASE_URL = localVpsUrl;

  return {
    hadApiMode,
    originalApiMode,
    hadVpsUrlInEnv,
    originalVpsUrlInEnv,
    hadVpsUrlInProcessEnv,
    originalVpsUrlInProcessEnv,
    localVpsUrl,
  };
}

function restoreConfig(original) {
  const config = readConfig();
  if (original.hadApiMode) {
    config.apiMode = original.originalApiMode;
  } else {
    delete config.apiMode;
  }
  writeConfig(config);

  const env = readEnv();
  if (original.hadVpsUrlInEnv) {
    env.EXPO_PUBLIC_VPS_API_BASE_URL = original.originalVpsUrlInEnv;
  } else {
    delete env.EXPO_PUBLIC_VPS_API_BASE_URL;
  }
  writeEnv(env);

  if (original.hadVpsUrlInProcessEnv) {
    process.env.EXPO_PUBLIC_VPS_API_BASE_URL =
      original.originalVpsUrlInProcessEnv;
  } else {
    delete process.env.EXPO_PUBLIC_VPS_API_BASE_URL;
  }
}

// ─── VPS API Server ──────────────────────────────────

function buildVpsApi() {
  const distPath = path.join(VPS_API_DIR, "dist");
  const needsBuild = !fs.existsSync(distPath);

  if (needsBuild) {
    log("vps-api", "Building scheduler module...", colors.yellow);
    try {
      execSync("npm install && npm run build", {
        cwd: VPS_API_DIR,
        stdio: "inherit",
      });
      log("vps-api", "Build complete", colors.green);
    } catch (e) {
      logError("vps-api", "Build failed");
      throw e;
    }
  }
}

function startVpsApi(port, envVars) {
  log("vps-api", `Starting on port ${port}...`, colors.cyan);

  const child = spawn("node", ["vps-api-server.js"], {
    cwd: VPS_API_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...envVars, PORT: String(port) },
  });

  child.stdout.on("data", (data) => {
    process.stdout.write(`${colors.cyan}[vps-api]${colors.reset} ${data}`);
  });

  child.stderr.on("data", (data) => {
    process.stderr.write(`${colors.red}[vps-api]${colors.reset} ${data}`);
  });

  return child;
}

// ─── Expo Server ─────────────────────────────────────

function startExpo(port, extraArgs) {
  log("expo", `Starting on port ${port}...`, colors.green);

  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawn(
    npxCmd,
    ["expo", "start", "--port", String(port), ...extraArgs],
    {
      cwd: ROOT_DIR,
      stdio: "inherit",
      env: process.env,
    },
  );

  return child;
}

// ─── Main ────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const separator = args.indexOf("--");
  const extraArgs = separator >= 0 ? args.slice(separator + 1) : args;

  console.log("");
  console.log(
    `${colors.bright}╔══════════════════════════════════════╗${colors.reset}`,
  );
  console.log(
    `${colors.bright}║   vibe-cooking Development Server    ║${colors.reset}`,
  );
  console.log(
    `${colors.bright}╚══════════════════════════════════════╝${colors.reset}`,
  );
  console.log("");

  // Find available ports
  log("setup", "Finding available ports...");

  const vpsPort = await findAvailablePort(VPS_PORT_START, MAX_TRIES);
  if (!vpsPort) {
    logError(
      "setup",
      `No available port in range ${VPS_PORT_START}-${VPS_PORT_START + MAX_TRIES - 1}`,
    );
    process.exit(1);
  }

  const expoPort = await findAvailablePort(EXPO_PORT_START, MAX_TRIES, {
    excludePorts: [vpsPort],
  });
  if (!expoPort) {
    logError(
      "setup",
      `No available port in range ${EXPO_PORT_START}-${EXPO_PORT_START + MAX_TRIES - 1}`,
    );
    process.exit(1);
  }

  log("setup", `VPS API port: ${vpsPort}`, colors.cyan);
  log("setup", `Expo port: ${expoPort}`, colors.green);

  // Build VPS API if needed
  buildVpsApi();

  // Load API keys from .env
  const envVars = readEnv();

  // Update config for local development
  const originalConfig = updateConfigForLocalDev(vpsPort);
  log(
    "setup",
    "Updated config.json and .env for local development",
    colors.yellow,
  );
  log(
    "setup",
    `Forced VPS base URL: ${originalConfig.localVpsUrl}`,
    colors.yellow,
  );

  // Start servers
  const vpsChild = startVpsApi(vpsPort, {
    CLAUDE_API_KEY: envVars.CLAUDE_API_KEY,
    MISTRAL_API_KEY: envVars.MISTRAL_API_KEY,
    ELEVENLABS_API_KEY: envVars.ELEVENLABS_API_KEY,
  });

  // Wait a moment for VPS API to start
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const expoChild = startExpo(expoPort, extraArgs);

  // Cleanup on exit
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    log("cleanup", "Shutting down...", colors.yellow);
    restoreConfig(originalConfig);
    log("cleanup", "Restored original config and env", colors.yellow);

    vpsChild.kill();
    expoChild.kill();
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  expoChild.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });

  vpsChild.on("exit", (code, signal) => {
    if (signal !== "SIGTERM" && signal !== "SIGKILL") {
      logError("vps-api", `Exited unexpectedly with code ${code}`);
    }
  });

  // Print summary
  console.log("");
  console.log(
    `${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`,
  );
  console.log(
    `${colors.green}✓${colors.reset} VPS API:  http://localhost:${vpsPort}`,
  );
  console.log(
    `${colors.green}✓${colors.reset} Expo:     http://localhost:${expoPort}`,
  );
  console.log(
    `${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`,
  );
  console.log("");
}

main().catch((error) => {
  logError("main", error.message);
  process.exit(1);
});
