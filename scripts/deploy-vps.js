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
  const remoteEnvFile = process.env.VPS_ENV_FILE || "/opt/vps-secrets/vibe-cooking-vps.env";

  const root = repoRoot();

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
    "dist/",
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
}

main();
