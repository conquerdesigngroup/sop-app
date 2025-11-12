import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase configuration
// IMPORTANT: Replace these with your actual Supabase project credentials
// You can find these in your Supabase project settings
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

// Helper function to check if Supabase is configured
export const isSupabaseConfigured = () => {
  return (
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl !== 'YOUR_SUPABASE_URL' &&
    supabaseAnonKey !== 'YOUR_SUPABASE_ANON_KEY' &&
    supabaseUrl.includes('supabase.co')
  );
};

// Create Supabase client only if properly configured
// Otherwise, create a mock client to prevent crashes
let supabaseClient: SupabaseClient | null = null;

if (isSupabaseConfigured()) {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'x-application-name': 'sop-app',
      },
    },
  });
} else {
  console.log('Supabase not configured - running in localStorage mode');
}

// Export the client (will be null if not configured)
export const supabase = supabaseClient as any;

// Export types for TypeScript
export type { User as SupabaseUser, Session as SupabaseSession } from '@supabase/supabase-js';
