#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/vps-secrets/vibe-cooking-vps.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

VOICE_ID="${ELEVENLABS_VOICE_ID:-aFDSnmXyFHr0IRaw35mG}"
MODEL_ID="${ELEVENLABS_MODEL:-eleven_multilingual_v2}"

if [ -z "${ELEVENLABS_API_KEY:-}" ]; then
  echo "missing ELEVENLABS_API_KEY in $ENV_FILE" >&2
  exit 1
fi

echo "voice_id=$VOICE_ID"
echo "model_id=$MODEL_ID"

tmp_json="/tmp/tts.json"
printf '{"text":"こんにちは","model_id":"%s","voice_settings":{"stability":0.5,"similarity_boost":0.75}}' "$MODEL_ID" > "$tmp_json"

eleven_url="https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}"

for i in 1 2 3 4 5; do
  echo "--- run $i"
  curl -sS -o /dev/null \
    -w "dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total}\n" \
    -X POST "$eleven_url" \
    -H "Content-Type: application/json" \
    -H "xi-api-key: ${ELEVENLABS_API_KEY}" \
    --data-binary "@$tmp_json"
done
