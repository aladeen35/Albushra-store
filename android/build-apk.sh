#!/usr/bin/env bash
# Builds an offline demo APK of the storefront: the site runs inside a WebView with the
# catalogue bundled (no backend needed). No Android SDK required — tools come from Maven Central:
#   apktool-lib (aapt2 + Android framework resources) and dalvik-dx (Java → dex).
# Needs: JDK 17+, Python 3, curl, and the local dev server with data (npm run dev) at $API.
#   ./android/build-apk.sh            → android/build/albushra-demo.apk
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/android"
OUT="$SRC/build"
TOOLS="$OUT/tools"
API="${API:-http://localhost:8787}"
MAVEN=https://repo.maven.apache.org/maven2
mkdir -p "$TOOLS"

fetch() { [ -s "$2" ] || curl -fsSL --retry 5 --retry-delay 5 -o "$2" "$1"; }
fetch "$MAVEN/org/apktool/apktool-lib/3.0.3/apktool-lib-3.0.3.jar" "$TOOLS/apktool-lib.jar"
fetch "$MAVEN/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar" "$TOOLS/dx.jar"
if [ ! -x "$TOOLS/aapt2" ]; then
  (cd "$TOOLS" && unzip -oq apktool-lib.jar prebuilt/linux/aapt2 prebuilt/android-framework.jar \
    && mv prebuilt/linux/aapt2 aapt2 && mv prebuilt/android-framework.jar android-framework.jar && chmod +x aapt2)
fi

echo "› assets"
rm -rf "$OUT/assets" "$OUT/classes" "$OUT/stubs" "$OUT"/*.apk "$OUT"/*.dex "$OUT"/res.zip
cp -r "$ROOT/public" "$OUT/assets"
rm -rf "$OUT/assets/admin" "$OUT/assets/_test"
cp "$SRC/demo-api.js" "$OUT/assets/js/demo-api.js"
# Load the offline API before the app (classic scripts run before modules).
sed -i 's#<script type="module" src="/js/app.js"></script>#<script src="/js/demo-api.js"></script>\n    <script type="module" src="/js/app.js"></script>#' "$OUT/assets/index.html"
mkdir -p "$OUT/assets/demo-data"
curl -fsS "$API/api/config" > "$OUT/assets/demo-data/config.json"
curl -fsS "$API/api/categories" > "$OUT/assets/demo-data/categories.json"
for r in sd intl; do curl -fsS "$API/api/products?region=$r&limit=100" > "$OUT/assets/demo-data/products-$r.json"; done
python3 - "$OUT/assets" "$API" <<'PY'
import json, os, sys, urllib.request
assets, api = sys.argv[1], sys.argv[2]
data = json.load(open(f"{assets}/demo-data/products-sd.json"))
urls = {u for p in data["products"] for u in p["images"] + [i for v in p["variants"] for i in v["images"]] if u.startswith("/media/")}
for u in urls:
    os.makedirs(os.path.dirname(assets + u), exist_ok=True)
    open(assets + u, "wb").write(urllib.request.urlopen(api + u).read())
print(f"  {len(data['products'])} products, {len(urls)} uploaded images")
PY

echo "› code"
mkdir -p "$OUT/stubs" "$OUT/classes"
javac -nowarn --release 8 -d "$OUT/stubs" $(find "$SRC/stubs" -name '*.java')
javac -nowarn --release 8 -cp "$OUT/stubs" -d "$OUT/classes" $(find "$SRC/src" -name '*.java')
java -cp "$TOOLS/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=24 --output="$OUT/classes.dex" "$OUT/classes"

echo "› resources + manifest"
"$TOOLS/aapt2" compile --dir "$SRC/res" -o "$OUT/res.zip"
"$TOOLS/aapt2" link -o "$OUT/unsigned.apk" -I "$TOOLS/android-framework.jar" --manifest "$SRC/AndroidManifest.xml" \
  --min-sdk-version 24 --target-sdk-version 29 -A "$OUT/assets" "$OUT/res.zip"
(cd "$OUT" && zip -qj unsigned.apk classes.dex)

echo "› sign"
KS="$OUT/demo.keystore"
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass bushra-demo -keypass bushra-demo -alias demo \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Albushra Store Demo" >/dev/null 2>&1
cp "$OUT/unsigned.apk" "$OUT/albushra-demo.apk"
jarsigner -keystore "$KS" -storepass bushra-demo -sigalg SHA256withRSA -digestalg SHA-256 "$OUT/albushra-demo.apk" demo >/dev/null
jarsigner -verify "$OUT/albushra-demo.apk" | tail -1
"$TOOLS/aapt2" dump badging "$OUT/albushra-demo.apk" | head -3
ls -la "$OUT/albushra-demo.apk"
