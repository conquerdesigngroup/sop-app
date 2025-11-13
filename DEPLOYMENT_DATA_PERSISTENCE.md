# Data Persistence & Production Deployment Guide

## Current State

Your app currently stores ALL data in **localStorage** (browser storage). This means:

### ❌ Problems with localStorage:
1. **Data is local to each browser** - If you access the app from a different computer or browser, you won't see your data
2. **No synchronization** - Changes made on one device don't appear on other devices
3. **Easily lost** - Clearing browser cache/data deletes everything
4. **No backup** - If localStorage is cleared, all your SOPs, tasks, users, and assignments are permanently lost
5. **Not production-ready** - Users expect their data to persist across sessions, devices, and team members

## ✅ Solution: Database Backend

You've already set up **Supabase** infrastructure in your code, but it's currently disabled because the configuration is not set. Here's what you need to do:

### Step 1: Set Up Supabase (Recommended - FREE tier available)

1. **Create Supabase Account**
   - Go to [https://supabase.com](https://supabase.com)
   - Sign up for free account (50,000 rows, 500MB database, 1GB file storage)

2. **Create New Project**
   - Click "New Project"
   - Choose organization
   - Enter project name: `sop-app` or your preferred name
   - Create a strong database password (save this!)
   - Select region closest to your users
   - Click "Create Project"

3. **Get API Credentials**
   - Once project is created, go to Settings > API
   - Copy the following:
     - Project URL (looks like: `https://xxxxx.supabase.co`)
     - `anon` public key (starts with `eyJ...`)

4. **Configure Your App**
   - Create a file: `.env.local` in your project root
   - Add these lines:
     ```
     REACT_APP_SUPABASE_URL=https://your-project.supabase.co
     REACT_APP_SUPABASE_ANON_KEY=your-anon-key-here
     ```
   - Replace the values with your actual Supabase credentials

5. **Database Schema**
   Your app needs these tables (SQL to run in Supabase SQL Editor):

```sql
-- Users table
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  department TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SOPs table
CREATE TABLE sops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  department TEXT NOT NULL,
  category TEXT NOT NULL,
  icon TEXT,
  image_url TEXT,
  steps JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  is_template BOOLEAN DEFAULT false,
  template_of UUID REFERENCES sops(id),
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Task Templates table
CREATE TABLE task_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  department TEXT NOT NULL,
  estimated_duration INTEGER DEFAULT 30,
  priority TEXT DEFAULT 'medium',
  sop_ids TEXT[] DEFAULT '{}',
  steps JSONB DEFAULT '[]'::jsonb,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job Tasks table
CREATE TABLE job_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES task_templates(id),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT[] DEFAULT '{}',
  assigned_by TEXT NOT NULL,
  department TEXT NOT NULL,
  category TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  due_time TIME,
  estimated_duration INTEGER DEFAULT 30,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  steps JSONB DEFAULT '[]'::jsonb,
  completed_steps TEXT[] DEFAULT '{}',
  progress_percentage INTEGER DEFAULT 0,
  sop_ids TEXT[] DEFAULT '{}',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by TEXT,
  completion_notes TEXT,
  completion_photos TEXT[] DEFAULT '{}',
  comments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_tasks ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all authenticated users for now)
CREATE POLICY "Allow all for authenticated users" ON users
  FOR ALL USING (true);

CREATE POLICY "Allow all for authenticated users" ON sops
  FOR ALL USING (true);

CREATE POLICY "Allow all for authenticated users" ON task_templates
  FOR ALL USING (true);

CREATE POLICY "Allow all for authenticated users" ON job_tasks
  FOR ALL USING (true);
```

### Step 2: Deploy to Vercel (or other hosting)

Once Supabase is configured:

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Configure Supabase for data persistence"
   git push origin main
   ```

2. **Deploy to Vercel**
   - Go to [https://vercel.com](https://vercel.com)
   - Sign in with GitHub
   - Click "New Project"
   - Import your repository
   - Add environment variables:
     - `REACT_APP_SUPABASE_URL`
     - `REACT_APP_SUPABASE_ANON_KEY`
   - Click "Deploy"

3. **Your app will now**:
   - Store all data in Supabase database
   - Sync across all devices and users
   - Be backed up automatically
   - Support real-time updates
   - Be production-ready!

## Alternative Options

### Option 2: Firebase (Google)
- Similar to Supabase
- Has free tier
- Good real-time capabilities
- Requires code changes to switch from Supabase

### Option 3: AWS / Custom Backend
- More complex
- Better for enterprise
- Requires significant development
- Higher costs

## Current localStorage Behavior

While Supabase is not configured, the app uses localStorage:
- File: `src/lib/supabase.ts` checks `isSupabaseConfigured()`
- If no env vars found, falls back to localStorage
- All contexts (SOPContext, TaskContext, AuthContext) have localStorage fallback code

## Migration Path

Once Supabase is set up:
1. Users log in with their accounts
2. Data is stored in Supabase
3. localStorage is no longer used for production data
4. You can export current localStorage data and manually import to Supabase if needed

## Save as Template Feature - FIXED ✅

The "Save as Template" feature has been updated to:
- **Create a duplicate** of the SOP/Task as a template
- **Keep the original** SOP/Task unchanged
- Add "(Template)" suffix to the duplicated item's title
- This applies to both SOPs and Job Tasks

### Before Fix:
When you clicked "Save as Template", it converted the existing SOP to a template (moved it from SOPs to Templates)

### After Fix:
When you click "Save as Template", it creates a copy marked as template while keeping your original SOP in the SOPs list

## Next Steps

1. ✅ **Fixed**: Save as Template now duplicates instead of converting
2. ⚠️ **Action Required**: Set up Supabase account and configure environment variables
3. ⚠️ **Action Required**: Run database schema SQL in Supabase
4. ⚠️ **Action Required**: Deploy to Vercel with environment variables
5. ✅ **Done**: Test the app - data will now persist!

## Questions?

- Supabase docs: https://supabase.com/docs
- Vercel deployment: https://vercel.com/docs
- React env variables: https://create-react-app.dev/docs/adding-custom-environment-variables/
