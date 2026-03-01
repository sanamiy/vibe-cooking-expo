const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const os = require("node:os");

function loadEnvFromDotenv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

function synthesizeSpeechToWav(targetPath, text) {
  const safeText = String(text || "").replace(/'/g, " ");
  const filter = `flite=text='${safeText}':voice=slt`;
  const ffmpeg = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      filter,
      "-ar",
      "16000",
      "-ac",
      "1",
      targetPath,
    ],
    { encoding: "utf8" },
  );
  if (ffmpeg.status !== 0) {
    throw new Error(
      `ffmpeg failed: ${ffmpeg.stderr || ffmpeg.stdout || "unknown error"}`,
    );
  }
}

function collectText(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((v) => collectText(v));
  if (!value || typeof value !== "object") return [];
  const out = [];
  if (typeof value.text === "string") out.push(value.text);
  if (typeof value.content === "string" || Array.isArray(value.content)) {
    out.push(...collectText(value.content));
  }
  return out;
}

function extractAssistantText(response) {
  const content = response?.choices?.[0]?.message?.content;
  return collectText(content)
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function main() {
  loadEnvFromDotenv();

  const repoRoot = path.join(__dirname, "..");
  const config = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "config.json"), "utf8"),
  );

  const synthText = "please move to next step";
  const prompt =
    "Transcribe the audio and return only the user utterance text.";
  const model = "voxtral-mini-2507";

  const wavPath = path.join(
    os.tmpdir(),
    `voxtral-speech-understanding-${Date.now()}.wav`,
  );
  try {
    synthesizeSpeechToWav(wavPath, synthText);
    const audioBase64 = fs.readFileSync(wavPath).toString("base64");

    if (config.apiMode === "vps_proxy") {
      const vpsBase = (process.env.EXPO_PUBLIC_VPS_API_BASE_URL || "").replace(
        /\/$/,
        "",
      );
      if (!vpsBase) {
        throw new Error(
          "EXPO_PUBLIC_VPS_API_BASE_URL is required in vps_proxy",
        );
      }
      const res = await fetch(`${vpsBase}/vps/audio/understand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64,
          prompt,
          model,
          temperature: 0,
        }),
      });
      const raw = await res.text();
      if (!res.ok) {
        throw new Error(`VPS API error ${res.status}: ${raw}`);
      }
      const data = JSON.parse(raw);
      console.log("mode=vps_proxy");
      console.log(`synthetic_audio_text="${synthText}"`);
      console.log(`voxtral_response="${String(data.text || "").trim()}"`);
      return;
    }

    const mistralKey =
      process.env.MISTRAL_API_KEY ||
      process.env.EXPO_PUBLIC_MISTRAL_API_KEY ||
      "";
    if (!mistralKey) {
      throw new Error("MISTRAL_API_KEY is required in direct_client mode");
    }

    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mistralKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: audioBase64,
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`Mistral API error ${res.status}: ${raw}`);
    }
    const data = JSON.parse(raw);
    const text = extractAssistantText(data);
    console.log("mode=direct_client");
    console.log(`synthetic_audio_text="${synthText}"`);
    console.log(`voxtral_response="${text}"`);
  } finally {
    if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
