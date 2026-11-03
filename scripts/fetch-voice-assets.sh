#!/usr/bin/env bash
# Idempotent download of the Kokoro model, audition voices and avatar GLB into the
# gitignored resources/assets/models/. Safe to re-run unattended: size-matched files are skipped.
set -euo pipefail
cd "$(dirname "$0")/.."

M=resources/assets/models
HF_TS=https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped/resolve/main
HF_V=https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices
GLB=https://raw.githubusercontent.com/met4citizen/TalkingHead/46b32ee539c41eb7c6b41fcfc74ae030d1b800a7/avatars/avatarsdk.glb

fetch() { # <url> <dest> <bytes>
  local url=$1 dest=$2 bytes=$3
  if [[ -f "$dest" && "$(stat -f%z "$dest")" == "$bytes" ]]; then
    echo "skip $dest"
    return
  fi
  mkdir -p "$(dirname "$dest")"
  curl -fsSL --retry 3 -o "$dest.part" "$url"
  local got
  got=$(stat -f%z "$dest.part")
  if [[ "$got" != "$bytes" ]]; then
    rm -f "$dest.part"
    echo "size mismatch for $dest: want $bytes, got $got" >&2
    exit 1
  fi
  mv "$dest.part" "$dest" # atomic: a partial download never looks complete
  echo "fetched $dest"
}

K=$M/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped
fetch "$HF_TS/config.json" "$K/config.json" 44
fetch "$HF_TS/tokenizer.json" "$K/tokenizer.json" 3497
fetch "$HF_TS/tokenizer_config.json" "$K/tokenizer_config.json" 113
fetch "$HF_TS/onnx/model.onnx" "$K/onnx/model.onnx" 325532171
for v in bm_george bm_lewis am_michael am_fenrir af_heart; do
  fetch "$HF_V/$v.bin" "$M/voices/$v.bin" 522240
done
fetch "$GLB" "$M/avatars/avatarsdk.glb" 12284040
