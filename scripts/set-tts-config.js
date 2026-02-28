#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const tts = process.argv[2];
if (!tts) {
  console.error("Usage: node scripts/set-tts-config.js <offline_expospeech|online_elevenlabs>");
  process.exit(1);
}

const allowed = new Set(["offline_expospeech", "online_elevenlabs"]);
if (!allowed.has(tts)) {
  console.error(`Invalid tts: ${tts}`);
  process.exit(1);
}

const target = path.join(__dirname, "..", "config.json");
fs.writeFileSync(target, JSON.stringify({ tts }, null, 2) + "\n", "utf8");
console.log(`Wrote ${target} with tts=${tts}`);
