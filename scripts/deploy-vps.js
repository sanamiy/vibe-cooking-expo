const { spawnSync } = require("node:child_process");
const path = require("node:path");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    ...opts,
  });
  if (res.error) throw res.error;
  if (typeof res.status === "number" && res.status !== 0) {
    throw new Error(`${cmd} exited with code ${res.status}`);
  }
}

function repoRoot() {
  return path.resolve(__dirname, "..");
}

function main() {
  const host = process.env.VPS_SSH_HOST || "temp";
  const remoteDir = process.env.VPS_REMOTE_DIR || "/opt/vibe-cooking-expo";
  const remoteComposeDir = `${remoteDir}/vps-compose`;
  const remoteEnvFile =
    process.env.VPS_ENV_FILE || "/opt/vps-secrets/vibe-cooking-vps.env";
  const expoQrAfterDeploy = (process.env.EXPO_QR_AFTER_DEPLOY ?? "1") !== "0";

  const root = repoRoot();

  run("npm", ["run", "build:web"], { cwd: root });

  run("ssh", [
    host,
    `bash -lc 'set -euo pipefail; test -f "${remoteEnvFile}"'`,
  ]);

  run("rsync", [
    "-az",
    "--delete",
    "--exclude",
    ".git/",
    "--exclude",
    "node_modules/",
    "--exclude",
    ".expo/",
    "--exclude",
    "build/",
    "--exclude",
    "test-results/",
    "--exclude",
    "playwright-report/",
    "--exclude",
    ".DS_Store",
    `${root}/`,
    `${host}:${remoteDir}/`,
  ]);

  run("ssh", [
    host,
    `bash -lc 'set -euo pipefail; cd "${remoteComposeDir}"; docker compose up -d'`,
  ]);

  run("ssh", [
    host,
    `bash -lc 'set -euo pipefail; curl -fsS https://temp.synome.jp/vps/health'`,
  ]);

  // Optionally start the Expo dev server so Expo Go QR is shown right away.
  // This keeps the process running until you quit Expo (Ctrl+C).
  if (expoQrAfterDeploy && process.stdout.isTTY && !process.env.CI) {
    // eslint-disable-next-line no-console
    console.log("\nStarting Expo dev server (for Expo Go QR)...");
    const extraArgs = (process.env.EXPO_START_ARGS ?? "--tunnel")
      .split(" ")
      .map((s) => s.trim())
      .filter(Boolean);
    const npmArgs = ["run", "start"];
    if (extraArgs.length > 0) {
      npmArgs.push("--", ...extraArgs);
    }
    run("npm", npmArgs, { cwd: root });
  }
}

main();
