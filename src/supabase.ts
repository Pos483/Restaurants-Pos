import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
