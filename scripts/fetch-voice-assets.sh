#!/usr/bin/env bash
# Idempotent download of the Kokoro model, audition voices, avatar GLB and whisper models
# (STT_MODELS="turbo base") into the gitignored resources/assets/models/. Safe to re-run
# unattended: size-matched files are skipped. WHISPER_CACHE=<dir> moves already-downloaded
# whisper models from <dir> instead of downloading; downloads refuse to run without enough disk.
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

HF_W=https://huggingface.co/ggerganov/whisper.cpp/resolve/main
W=$M/whisper

need_space() { # <bytes> <file>
  local avail=$(( $(df -k . | awk 'NR==2{print $4}') * 1024 ))
  if (( avail < $1 + 1073741824 )); then
    echo "not enough disk for $2: need $(( ($1 + 1073741824) / 1048576 )) MB free, have $(( avail / 1048576 )) MB" >&2
    exit 1
  fi
}

sha_ok() { [[ "$(shasum -a 256 "$1" | cut -d' ' -f1)" == "$2" ]]; }

whisper_model() { # <file> <bytes> <sha>
  local f=$1 bytes=$2 sha=$3 dest=$W/$1
  if [[ -f "$dest" && "$(stat -f%z "$dest")" == "$bytes" ]]; then
    echo "skip $dest"
    return
  fi
  if [[ -n "${WHISPER_CACHE:-}" && -f "$WHISPER_CACHE/$f" && "$(stat -f%z "$WHISPER_CACHE/$f")" == "$bytes" ]]; then
    mkdir -p "$W"
    mv "$WHISPER_CACHE/$f" "$dest"
    sha_ok "$dest" "$sha" || { rm -f "$dest"; echo "sha256 mismatch for $dest" >&2; exit 1; }
    echo "moved $dest"
    return
  fi
  need_space "$bytes" "$f"
  fetch "$HF_W/$f" "$dest" "$bytes"
  sha_ok "$dest" "$sha" || { rm -f "$dest"; echo "sha256 mismatch for $dest" >&2; exit 1; }
}

for m in ${STT_MODELS:-turbo base}; do
  case $m in
    turbo) whisper_model ggml-large-v3-turbo-q5_0.bin 574041195 394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2 ;;
    base) whisper_model ggml-base.en.bin 147964211 a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002 ;;
    *) echo "unknown STT model: $m" >&2; exit 1 ;;
  esac
done
