import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Build timestamp for cache busting - updated on each deploy
const BUILD_TIMESTAMP = '2026-02-04T12:00:00Z';

// Supabase configuration
// IMPORTANT: Replace these with your actual Supabase project credentials
// You can find these in your Supabase project settings
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

// Debug logging for production troubleshooting
if (typeof window !== 'undefined') {
  console.log('[SOP App] Build timestamp:', BUILD_TIMESTAMP);
  console.log('[SOP App] Supabase URL configured:', !!supabaseUrl && supabaseUrl.includes('supabase.co'));
  console.log('[SOP App] Supabase Key configured:', !!supabaseAnonKey && supabaseAnonKey.length > 20);
}

// Helper function to check if Supabase is configured
export const isSupabaseConfigured = () => {
  const configured = (
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl !== 'YOUR_SUPABASE_URL' &&
    supabaseAnonKey !== 'YOUR_SUPABASE_ANON_KEY' &&
    supabaseUrl.includes('supabase.co')
  );

  if (typeof window !== 'undefined') {
    console.log('[SOP App] isSupabaseConfigured:', configured);
  }

  return configured;
};

// Flag to indicate if activity_logs table exists in Supabase
// Set to true to enable activity logging to Supabase database
export const hasActivityLogsTable = true;

// Create Supabase client only if properly configured
// Otherwise, create a mock client to prevent crashes
let supabaseClient: SupabaseClient | null = null;

if (isSupabaseConfigured()) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'sop-app-auth', // Custom storage key to avoid conflicts
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'x-application-name': 'sop-app',
        },
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    console.log('[SOP App] Supabase client created successfully');
  } catch (error) {
    console.error('[SOP App] Error creating Supabase client:', error);
    supabaseClient = null;
  }
}

// Export the client (will be null if not configured)
export const supabase = supabaseClient as any;

// Export types for TypeScript
export type { User as SupabaseUser, Session as SupabaseSession } from '@supabase/supabase-js';
