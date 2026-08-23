#!/bin/bash

# Script to update version across all files
# Usage: ./update-version.sh 1.0.3

if [ -z "$1" ]; then
  echo "Usage: ./update-version.sh <version>"
  echo "Example: ./update-version.sh 1.0.3"
  exit 1
fi

NEW_VERSION=$1

echo "Updating version to $NEW_VERSION..."

# Update package.json
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
else
  # Linux
  sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
fi

# Update service-worker.js
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/const CACHE_VERSION = '.*';/const CACHE_VERSION = '$NEW_VERSION';/" public/service-worker.js
else
  sed -i "s/const CACHE_VERSION = '.*';/const CACHE_VERSION = '$NEW_VERSION';/" public/service-worker.js
fi

# Update src/version.ts (the single source for everything inside the bundle)
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/export const APP_VERSION = '.*';/export const APP_VERSION = '$NEW_VERSION';/" src/version.ts
else
  sed -i "s/export const APP_VERSION = '.*';/export const APP_VERSION = '$NEW_VERSION';/" src/version.ts
fi

# Update manifest.json
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/\"version\": \".*\",/\"version\": \"$NEW_VERSION\",/" public/manifest.json
else
  sed -i "s/\"version\": \".*\",/\"version\": \"$NEW_VERSION\",/" public/manifest.json
fi

echo "✅ Version updated to $NEW_VERSION in:"
echo "   - package.json"
echo "   - src/version.ts        (SettingsPage and any other in-bundle use)"
echo "   - public/service-worker.js  (CACHE_VERSION — the one that matters)"
echo "   - public/manifest.json"
echo ""
echo "No manual edits needed. SettingsPage reads src/version.ts."
echo ""
echo "Why the service worker copy matters: a browser installs a new worker only"
echo "when service-worker.js differs byte-for-byte from the installed one. Skip"
echo "this bump and installed phones get no update banner and never evict the"
echo "old cache — an offline launch keeps serving the previous build."
echo ""
echo "Next steps:"
echo "1. Verify: grep -rn \"$NEW_VERSION\" package.json src/version.ts public/service-worker.js public/manifest.json"
echo "2. Build: npm run build"
echo "3. Commit and deploy"
