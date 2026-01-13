# Quick Deployment Checklist

## Pre-Deployment (Version Bump)

### Option A: Automated (Recommended)
```bash
./update-version.sh 1.0.3
# Then manually update SettingsPage.tsx (2 places) with the new version
```

### Option B: Manual
- [ ] Update `package.json` → `"version": "1.0.3"`
- [ ] Update `public/service-worker.js` → `const CACHE_VERSION = '1.0.3';`
- [ ] Update `public/manifest.json` → `"version": "1.0.3"`
- [ ] Update `src/pages/SettingsPage.tsx` line ~351 → Cache Version
- [ ] Update `src/pages/SettingsPage.tsx` line ~397 → App Version

## Build & Test
```bash
npm run build
npx serve -s build  # Test locally
```

## Deploy
```bash
git add .
git commit -m "Bump version to 1.0.3"
git push
```

## Post-Deployment

### Verify on Production
- [ ] Check Settings > About shows new version
- [ ] Check Settings > Cache & Data shows new cache version
- [ ] Test that service worker updates (wait 60s or hard refresh)

### If Users Report Old Content
Tell them to:
1. Go to Settings (gear icon)
2. Scroll to "Cache & Data"
3. Click "Clear All Cache & Reload"

## Emergency Cache Clear (For All Users)

If many users are stuck on old version:

1. **Increment version again** (force new service worker)
2. **Add breaking change** to service-worker.js:
   ```javascript
   const CACHE_VERSION = '1.0.4-force-clear';
   ```
3. Deploy immediately
4. Service worker will force-clear all old caches

## Quick Fixes

### Old logo persisting
- Not a cache issue if it persists after cache clear
- Check `public/` folder for old logo files
- Check any hardcoded image URLs

### Old SOP data persisting
- This is database data, not cache
- Check Supabase for old records
- Clear cache won't help with this

### Service worker not updating
- Verify cache version was incremented
- Check browser DevTools > Application > Service Workers
- Try: Unregister SW → Close all tabs → Reopen app
