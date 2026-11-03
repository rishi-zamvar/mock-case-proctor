#!/usr/bin/env bash
# Post-package verification: ad-hoc signature, entitlements on app + renderer helper, usage strings, arm64.
set -euo pipefail
cd "$(dirname "$0")/.."
APP="release/mac-arm64/Mock Case Proctor.app"
HELPER="$APP/Contents/Frameworks/Mock Case Proctor Helper (Renderer).app"
ent() { codesign -d --entitlements - --xml "$1" 2>/dev/null || codesign -d --entitlements :- "$1" 2>/dev/null; }
# grep -q on a pipe + pipefail = SIGPIPE false negatives, so capture output first.
SIG=$(codesign -dv "$APP" 2>&1)
grep -q "Signature=adhoc" <<<"$SIG" || { echo "not ad-hoc signed"; exit 1; }
for t in "$APP" "$HELPER"; do
  E=$(ent "$t")
  for k in device.audio-input device.camera cs.allow-jit cs.disable-library-validation; do
    grep -q "com.apple.security.$k" <<<"$E" || { echo "missing $k in $t"; exit 1; }
  done
done
plutil -extract NSMicrophoneUsageDescription raw "$APP/Contents/Info.plist" >/dev/null
plutil -extract NSCameraUsageDescription raw "$APP/Contents/Info.plist" >/dev/null
grep -q arm64 <<<"$(file "$APP/Contents/MacOS/Mock Case Proctor")" || { echo "not arm64"; exit 1; }
test -d "$APP/Contents/Resources/app.asar.unpacked/resources/assets" || { echo "assets not unpacked"; exit 1; }
UNP="$APP/Contents/Resources/app.asar.unpacked"
test -f "$UNP/node_modules/@whisper-cpp-node/darwin-arm64/whisper.node" || { echo "whisper.node not unpacked"; exit 1; }
TURBO="$UNP/resources/assets/models/whisper/ggml-large-v3-turbo-q5_0.bin"
test -f "$TURBO" || { echo "turbo model not unpacked"; exit 1; }
[ "$(stat -f %z "$TURBO")" = 574041195 ] || { echo "turbo model wrong size"; exit 1; }
test ! -e "$UNP/resources/assets/models/whisper/ggml-base.en.bin" || { echo "base.en must not ship"; exit 1; }
ASAR=$(node -e "console.log(require('@electron/asar').listPackage(process.argv[1]).join('\\n'))" "$APP/Contents/Resources/app.asar")
grep -q "out/main/sttWorker.js" <<<"$ASAR" || { echo "sttWorker.js missing from asar"; exit 1; }
echo "package OK"
