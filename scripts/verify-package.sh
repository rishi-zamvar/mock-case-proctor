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
echo "package OK"
