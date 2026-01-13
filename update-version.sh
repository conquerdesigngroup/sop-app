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

# Update manifest.json
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/\"version\": \".*\",/\"version\": \"$NEW_VERSION\",/" public/manifest.json
else
  sed -i "s/\"version\": \".*\",/\"version\": \"$NEW_VERSION\",/" public/manifest.json
fi

echo "✅ Version updated to $NEW_VERSION in:"
echo "   - package.json"
echo "   - public/service-worker.js"
echo "   - public/manifest.json"
echo ""
echo "⚠️  Don't forget to manually update SettingsPage.tsx (2 places):"
echo "   - Line ~351: Cache Version display"
echo "   - Line ~397: App Version display"
echo ""
echo "Next steps:"
echo "1. Update SettingsPage.tsx manually"
echo "2. Test the changes: npm start"
echo "3. Build: npm run build"
echo "4. Commit: git add . && git commit -m \"Bump version to $NEW_VERSION\""
echo "5. Deploy to production"
