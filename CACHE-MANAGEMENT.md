# Cache Management Guide

## Overview
This app uses a Service Worker for Progressive Web App (PWA) functionality. This provides offline support but can sometimes cause caching issues where old content persists after deployments.

## What Changed

### 1. Service Worker Cache Versioning
- **File**: `public/service-worker.js`
- **Version**: Now tied to package.json version (1.0.2)
- **What to do**: Increment the `CACHE_VERSION` constant whenever you deploy

```javascript
const CACHE_VERSION = '1.0.2'; // Change this on each deployment
```

### 2. Network-First Strategy for HTML
- HTML pages and API calls now use **network-first** caching
- This means the app always tries to fetch fresh content from the server first
- Falls back to cache only when offline
- Static assets (CSS, JS, images) still use cache-first for performance

### 3. Automatic Update Detection
- The app checks for service worker updates every 60 seconds
- When a new version is detected, users see a prompt to update
- Clicking "OK" forces immediate update and reload

### 4. Cache Management UI
- **Location**: Settings page (gear icon in navigation)
- **Features**:
  - View current cache version
  - See service worker status
  - Clear all cache with one button click

## For Deployments

### Before Each Deployment

1. **Update version in package.json**:
   ```json
   {
     "version": "1.0.3"
   }
   ```

2. **Update cache version in service-worker.js**:
   ```javascript
   const CACHE_VERSION = '1.0.3';
   ```

3. **Update versions in SettingsPage.tsx** (2 places):
   - Line 351: Cache Version display
   - Line 397: App Version display

4. **Update manifest.json**:
   ```json
   {
     "version": "1.0.3"
   }
   ```

### After Deployment

Users have three ways to get the new version:

1. **Automatic**: Wait 60 seconds and accept the update prompt
2. **Manual Refresh**: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. **Clear Cache**: Go to Settings > Cache & Data > Clear All Cache & Reload

## Troubleshooting Old Cache

### If Users See Old Content (Media Maple logo, old SOPs, etc.):

#### Option 1: Use the Clear Cache Button (Recommended)
1. Click the gear icon (Settings) in the navigation
2. Scroll to "Cache & Data" section
3. Click "Clear All Cache & Reload"
4. The app will reload with fresh content

#### Option 2: Manual Browser Cache Clear
1. Open browser DevTools (F12)
2. Go to Application tab (Chrome) or Storage tab (Firefox)
3. Click "Clear storage" or "Clear site data"
4. Check all boxes and click "Clear"
5. Refresh the page

#### Option 3: Unregister Service Worker Manually
1. Open browser DevTools (F12)
2. Go to Application > Service Workers
3. Click "Unregister" next to the service worker
4. Close all tabs with the app
5. Reopen the app

#### Option 4: Hard Refresh
- **Windows/Linux**: Ctrl + Shift + R
- **Mac**: Cmd + Shift + R
- **Or**: Hold Shift and click browser refresh button

## For Developers

### Testing Cache Updates Locally

1. Build the production version:
   ```bash
   npm run build
   ```

2. Serve the build locally:
   ```bash
   npx serve -s build
   ```

3. Test cache updates:
   - Make a change
   - Rebuild
   - Wait 60 seconds or refresh
   - Should see update prompt

### Debugging Cache Issues

Check the console for service worker logs:
- `Installing new service worker version: X.X.X`
- `Activating service worker version: X.X.X`
- `Deleting old cache: sop-app-vX.X.X`

### Cache Strategy Details

**Network-First (HTML/API)**:
- Tries network first
- Falls back to cache if offline
- Always caches successful responses

**Cache-First (Assets)**:
- Returns cached version immediately
- Updates cache in background
- Ensures fast load times while staying fresh

## Common Issues

### Issue: Old logo still showing
**Solution**: The old logo is cached. Use Settings > Clear Cache button.

### Issue: Old SOPs appearing
**Solution**: This is likely data in Supabase, not cache. Check your database.

### Issue: Service worker not updating
**Solution**:
1. Check cache version was incremented
2. Ensure service-worker.js was deployed
3. Try unregistering service worker manually

### Issue: "Service Worker: Not Available" in Settings
**Solution**:
1. Check if HTTPS is enabled (service workers require HTTPS in production)
2. Ensure service-worker.js exists in build output
3. Check browser compatibility

## Best Practices

1. **Always increment version numbers** on every deployment
2. **Test deployments** on staging environment first
3. **Communicate updates** to users via email/Slack
4. **Monitor logs** after deployment for cache-related errors
5. **Keep CACHE-MANAGEMENT.md updated** with any changes

## Quick Version Bump Checklist

- [ ] Update `package.json` version
- [ ] Update `public/service-worker.js` CACHE_VERSION
- [ ] Update `public/manifest.json` version
- [ ] Update `src/pages/SettingsPage.tsx` version displays (2 places)
- [ ] Commit with message: "Bump version to X.X.X"
- [ ] Deploy
- [ ] Test on production

## Questions?

If you continue to see cache issues after following this guide, please check:
1. Browser cache is actually cleared (check DevTools > Application > Storage)
2. Service worker is updated (check DevTools > Application > Service Workers)
3. Correct version is deployed (check Settings > About)
