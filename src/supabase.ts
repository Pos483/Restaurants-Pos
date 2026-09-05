import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lecqxvnznxceonmuqatv.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlY3F4dm56bnhjZW9ubXVxYXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MjYxMTcsImV4cCI6MjA5NDQwMjExN30.E6vyy-XF-GfmVjkZiWf3WMNX7bsYtj3PuntBCY90KsQ';

let supabaseClient: SupabaseClient | null = null;

try {
  if (supabaseUrl && supabaseUrl.startsWith('http') && supabaseAnonKey) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }
} catch (error) {
  console.error("Failed to initialize Supabase:", error);
}

export const supabase = supabaseClient;

// Helper to check if Supabase is properly configured
export const isSupabaseConfigured = () => {
  return supabase !== null;
};
