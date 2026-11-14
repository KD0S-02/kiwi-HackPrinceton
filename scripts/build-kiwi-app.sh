#!/bin/zsh
# Builds dist/Kiwi.app. Run this once. Do not run it again unless you have to:
# every rebuild changes the signature, and macOS then asks for permissions again.
set -e
cd "$(dirname "$0")/.."
rm -rf dist/Kiwi.app
mkdir -p dist
cp -R node_modules/electron/dist/Electron.app dist/Kiwi.app
plist=dist/Kiwi.app/Contents/Info.plist
plutil -replace CFBundleName -string Kiwi $plist
plutil -replace CFBundleDisplayName -string Kiwi $plist
plutil -replace CFBundleIdentifier -string com.fieldnote.kiwi $plist
plutil -replace NSMicrophoneUsageDescription -string "Kiwi uses the microphone while you hold Control and Option." $plist
plutil -replace NSScreenCaptureUsageDescription -string "Kiwi looks at your screen so it can point at buttons in Fieldnote." $plist
cp apps/desktop/kiwi.icns dist/Kiwi.app/Contents/Resources/electron.icns
mkdir -p dist/Kiwi.app/Contents/Resources/app
echo '{ "name": "kiwi", "productName": "Kiwi", "version": "0.1.0", "main": "main.mjs", "type": "module" }' > dist/Kiwi.app/Contents/Resources/app/package.json
echo "import \"$PWD/apps/desktop/start.mjs\";" > dist/Kiwi.app/Contents/Resources/app/main.mjs
# The requirement names only the bundle id, so the signature identity stays the same on rebuilds
# and macOS keeps the permissions you already gave.
codesign --force --deep --sign - -r='designated => identifier "com.fieldnote.kiwi"' dist/Kiwi.app
echo "Built dist/Kiwi.app"
