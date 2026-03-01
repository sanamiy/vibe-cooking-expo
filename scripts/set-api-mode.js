#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const apiMode = process.argv[2];
if (!apiMode) {
  console.error("Usage: node scripts/set-api-mode.js <vps_proxy|direct_client|cloudflare>");
  process.exit(1);
}

const allowed = new Set(["vps_proxy", "direct_client", "cloudflare"]);
if (!allowed.has(apiMode)) {
  console.error(`Invalid apiMode: ${apiMode}`);
  process.exit(1);
}

const target = path.join(__dirname, "..", "config.json");
const current = JSON.parse(fs.readFileSync(target, "utf8"));
const next = { ...current, apiMode };
fs.writeFileSync(target, JSON.stringify(next, null, 2) + "\n", "utf8");
console.log(`Wrote ${target} with apiMode=${apiMode}`);
