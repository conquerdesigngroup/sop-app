-- Migration v3: Fix profiles RLS policies for team member creation
-- Run this in your Supabase SQL Editor

-- =============================================
-- FIX PROFILES INSERT POLICY
-- =============================================
-- The old policy blocks the trigger from creating profiles because it checks
-- if the current user is an admin, but during signup there's no profile yet.

-- Drop the problematic policies
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Create a new INSERT policy that allows:
-- 1. The trigger (running as SECURITY DEFINER) to insert
-- 2. Admins to insert profiles for new users
-- 3. Users to insert their own profile (for the first signup)
CREATE POLICY "Allow profile creation"
  ON public.profiles FOR INSERT
  WITH CHECK (
    -- Allow if the profile being created is for the current auth user (self-registration)
    auth.uid() = id
    OR
    -- Allow if current user is an admin (creating for others)
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Update policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Update policy: Admins can update any profile
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =============================================
-- VERIFY THE TRIGGER EXISTS
-- =============================================
-- Make sure the trigger function exists and handles errors gracefully

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert the new profile, handling potential duplicates gracefully
  INSERT INTO public.profiles (id, email, first_name, last_name, role, department)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', 'Name'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'team'),
    COALESCE(NEW.raw_user_meta_data->>'department', 'General')
  )
  ON CONFLICT (id) DO NOTHING;  -- Skip if profile already exists

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the auth signup
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger (drop first to avoid duplicates)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- GRANT NECESSARY PERMISSIONS
-- =============================================
-- Ensure the authenticated role can insert into profiles
GRANT INSERT ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE ON public.profiles TO authenticated;

-- =============================================
-- DONE! Test by creating a new user via the app.
-- =============================================
