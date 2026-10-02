-- ============================================================
-- Migration: Festival & Auto Discount Offer Configuration
-- Created: 2026-10-02
-- 
-- Adds native columns to public.restaurant_profile to support
-- persistent Festival & Auto Discounts (Durga Puja, Diwali, etc.)
-- ============================================================

ALTER TABLE public.restaurant_profile 
  ADD COLUMN IF NOT EXISTS festival_discount_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS festival_discount_name TEXT DEFAULT 'Festival Offer',
  ADD COLUMN IF NOT EXISTS festival_discount_type TEXT DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS festival_discount_value NUMERIC DEFAULT 10,
  ADD COLUMN IF NOT EXISTS festival_discount_min_order NUMERIC DEFAULT 0;

-- Ensure settings table exists with JSONB storage for dynamic modules
CREATE TABLE IF NOT EXISTS public.settings (
  app_user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (app_user_id, id)
);

-- Enable RLS on settings
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Allow users to manage their own settings rows
DROP POLICY IF EXISTS "users_manage_own_settings" ON public.settings;
CREATE POLICY "users_manage_own_settings"
  ON public.settings
  FOR ALL
  TO authenticated
  USING (app_user_id = auth.uid()::TEXT)
  WITH CHECK (app_user_id = auth.uid()::TEXT);

-- Allow public read on global settings
DROP POLICY IF EXISTS "public_read_global_settings" ON public.settings;
CREATE POLICY "public_read_global_settings"
  ON public.settings
  FOR SELECT
  TO public
  USING (app_user_id = 'global');

-- Grant permissions to authenticated, anon, service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated, anon, service_role;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
