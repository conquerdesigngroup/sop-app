# 🚀 Supabase + PWA Setup Guide

Complete guide to deploy your SOP App with Supabase backend and offline PWA capabilities.

---

## 📋 Table of Contents

1. [Supabase Setup](#1-supabase-setup)
2. [Database Configuration](#2-database-configuration)
3. [Environment Variables](#3-environment-variables)
4. [Deploy to Vercel](#4-deploy-to-vercel)
5. [PWA & Offline Mode](#5-pwa--offline-mode)
6. [Testing](#6-testing)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Supabase Setup

### Step 1.1: Create Supabase Account

1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project"
3. Sign up with GitHub (recommended) or email
4. Verify your email address

### Step 1.2: Create New Project

1. Click "New Project"
2. Fill in the details:
   - **Name:** `sop-app` (or your preferred name)
   - **Database Password:** Create a strong password (SAVE THIS!)
   - **Region:** Choose closest to your users
   - **Pricing Plan:** Start with Free tier
3. Click "Create new project"
4. Wait 2-3 minutes for project to initialize

### Step 1.3: Get API Credentials

1. In your Supabase dashboard, click "Settings" (gear icon)
2. Click "API" in the left sidebar
3. You'll see two important values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: A long string starting with `eyJ...`
4. **Copy these values** - you'll need them soon!

---

## 2. Database Configuration

### Step 2.1: Run Database Schema

1. In Supabase dashboard, click "SQL Editor" (database icon)
2. Click "New query"
3. Copy the entire contents of `supabase-schema.sql` from your project
4. Paste into the SQL editor
5. Click "Run" button (or press Cmd/Ctrl + Enter)
6. You should see "Success. No rows returned"

### Step 2.2: Verify Tables Created

1. Click "Table Editor" in left sidebar
2. You should see these tables:
   - ✅ `profiles`
   - ✅ `sops`
   - ✅ `task_templates`
   - ✅ `job_tasks`

### Step 2.3: Configure Authentication

1. Click "Authentication" → "Providers" in left sidebar
2. Enable "Email" provider (should be on by default)
3. **Email Templates** (optional but recommended):
   - Click "Email Templates"
   - Customize "Confirm signup" email
   - Customize "Magic Link" email (if using)

### Step 2.4: Create First Admin User

1. Click "Authentication" → "Users"
2. Click "Add user" → "Create new user"
3. Fill in:
   - **Email:** your-admin@email.com
   - **Password:** Choose a strong password
   - **Auto Confirm User:** ✅ (check this box)
   - **User Metadata:** Add this JSON:
     ```json
     {
       "first_name": "Admin",
       "last_name": "User",
       "role": "admin",
       "department": "Admin"
     }
     ```
4. Click "Create user"
5. The profile will be auto-created via trigger!

---

## 3. Environment Variables

### Step 3.1: Create .env.local File

In your project root, create `.env.local`:

```bash
# Copy from .env.example
cp .env.example .env.local
```

### Step 3.2: Add Your Credentials

Edit `.env.local` with your actual values:

```env
REACT_APP_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGc...your-actual-key-here
REACT_APP_NAME=SOP App
REACT_APP_VERSION=1.1.0
REACT_APP_ENABLE_OFFLINE_MODE=true
REACT_APP_ENABLE_PWA=true
```

**Important:** Never commit `.env.local` to Git! It's already in `.gitignore`.

### Step 3.3: Test Connection

```bash
npm start
```

The app should now connect to Supabase instead of localStorage!

---

## 4. Deploy to Vercel

### Step 4.1: Push to GitHub

1. Create a new GitHub repository
2. Initialize git in your project (if not already):
   ```bash
   git init
   git add .
   git commit -m "Initial commit with Supabase integration"
   ```
3. Add remote and push:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/sop-app.git
   git branch -M main
   git push -u origin main
   ```

### Step 4.2: Deploy to Vercel

1. Go to [https://vercel.com](https://vercel.com)
2. Sign up with GitHub
3. Click "Add New..." → "Project"
4. Import your `sop-app` repository
5. Configure project:
   - **Framework Preset:** Create React App
   - **Root Directory:** `./`
   - **Build Command:** `npm run build`
   - **Output Directory:** `build`

### Step 4.3: Add Environment Variables in Vercel

1. In "Environment Variables" section, add:
   ```
   REACT_APP_SUPABASE_URL = https://YOUR_PROJECT_ID.supabase.co
   REACT_APP_SUPABASE_ANON_KEY = your-anon-key-here
   REACT_APP_ENABLE_OFFLINE_MODE = true
   REACT_APP_ENABLE_PWA = true
   ```
2. Click "Deploy"
3. Wait 2-3 minutes
4. Your app will be live at `https://your-app.vercel.app`!

### Step 4.4: Add Custom Domain (Optional)

1. Go to project settings → "Domains"
2. Add your domain (e.g., `sop.yourcompany.com`)
3. Follow DNS configuration instructions
4. Vercel auto-provisions SSL certificate

---

## 5. PWA & Offline Mode

### Step 5.1: PWA Features

Your app now includes:
- ✅ **Offline access** - Works without internet
- ✅ **Install prompt** - Add to home screen
- ✅ **Background sync** - Syncs when back online
- ✅ **Offline indicators** - Shows connection status
- ✅ **Cached assets** - Fast loading

### Step 5.2: Testing PWA Locally

1. Build production version:
   ```bash
   npm run build
   npm install -g serve
   serve -s build
   ```

2. Open Chrome DevTools → Application tab
3. Check:
   - Service Worker: Should be "activated and running"
   - Cache Storage: Should show cached files
   - Offline: Toggle offline mode and test

### Step 5.3: Install on Mobile

1. Open your deployed app on mobile (Chrome/Safari)
2. Tap "Share" → "Add to Home Screen"
3. App will install like a native app!
4. Works offline with cached data

---

## 6. Testing

### Test Checklist

#### Authentication
- [ ] Admin can log in
- [ ] Team member can log in
- [ ] Password reset works
- [ ] Session persists after refresh
- [ ] Logout works properly

#### Team Management
- [ ] Admin can create new users
- [ ] Admin can edit users
- [ ] Admin can deactivate users
- [ ] Email uniqueness is enforced
- [ ] Role-based access works

#### SOPs
- [ ] Admin can create SOPs
- [ ] Admin can edit SOPs
- [ ] SOPs sync across users in real-time
- [ ] Team members can view published SOPs
- [ ] Team members can't edit SOPs

#### Tasks
- [ ] Admin can assign tasks
- [ ] Team members can see their tasks
- [ ] Task status updates sync
- [ ] Calendar shows correct dates
- [ ] Completed tasks show correctly

#### Offline Mode
- [ ] App loads offline
- [ ] Can view cached data offline
- [ ] Changes save locally offline
- [ ] Changes sync when back online
- [ ] Conflict resolution works

---

## 7. Troubleshooting

### Issue: "Invalid API key"

**Solution:**
- Check `.env.local` has correct `REACT_APP_SUPABASE_ANON_KEY`
- Restart dev server: `npm start`
- Clear browser cache

### Issue: "Row Level Security policy violation"

**Solution:**
- Make sure you ran the complete `supabase-schema.sql`
- Check RLS policies in Supabase → Authentication → Policies
- Verify user has correct role in profiles table

### Issue: "User not found in profiles table"

**Solution:**
- Check if trigger `on_auth_user_created` exists
- Manually insert profile:
  ```sql
  INSERT INTO public.profiles (id, email, first_name, last_name, role, department)
  SELECT id, email, 'First', 'Last', 'admin', 'Admin'
  FROM auth.users
  WHERE email = 'your-email@example.com';
  ```

### Issue: App doesn't work offline

**Solution:**
- Check service worker is registered: DevTools → Application → Service Workers
- Verify HTTPS is enabled (PWA requires HTTPS)
- Clear cache and reload: Cmd/Ctrl + Shift + R
- Check `REACT_APP_ENABLE_PWA=true` in env vars

### Issue: Real-time updates not working

**Solution:**
- Supabase Realtime requires subscription
- Check Realtime is enabled in Supabase → Database → Replication
- Enable replication for tables: sops, job_tasks, profiles

### Issue: Build fails on Vercel

**Solution:**
- Check all env vars are set in Vercel
- Verify no TypeScript errors: `npm run build` locally
- Check build logs in Vercel dashboard
- Ensure Node version matches (16.x or higher)

---

## 🎯 Quick Reference

### Useful Supabase Dashboard Links

- **Project Dashboard:** `https://app.supabase.com/project/YOUR_PROJECT_ID`
- **Table Editor:** `https://app.supabase.com/project/YOUR_PROJECT_ID/editor`
- **SQL Editor:** `https://app.supabase.com/project/YOUR_PROJECT_ID/sql`
- **Authentication:** `https://app.supabase.com/project/YOUR_PROJECT_ID/auth/users`
- **API Settings:** `https://app.supabase.com/project/YOUR_PROJECT_ID/settings/api`

### Useful Commands

```bash
# Start development server
npm start

# Build for production
npm run build

# Test production build locally
npm install -g serve
serve -s build

# Check for TypeScript errors
npm run build

# View logs
npm run start | grep -i error
```

### Environment Variables Needed

| Variable | Where to Get | Required |
|----------|-------------|----------|
| REACT_APP_SUPABASE_URL | Supabase → Settings → API | Yes |
| REACT_APP_SUPABASE_ANON_KEY | Supabase → Settings → API | Yes |
| REACT_APP_ENABLE_OFFLINE_MODE | Set to `true` | No |
| REACT_APP_ENABLE_PWA | Set to `true` | No |

---

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Deployment Docs](https://vercel.com/docs)
- [PWA Checklist](https://web.dev/pwa-checklist/)
- [React + Supabase Guide](https://supabase.com/docs/guides/getting-started/tutorials/with-react)

---

## 🆘 Need Help?

1. Check [Supabase Discord](https://discord.supabase.com)
2. Review [Vercel Support](https://vercel.com/support)
3. Check browser console for errors
4. Review Supabase logs in dashboard

---

**Next Steps:**
1. Complete Supabase setup above
2. Test authentication
3. Deploy to Vercel
4. Share app with team!

---

Last Updated: November 12, 2025
Version: 1.1.0
