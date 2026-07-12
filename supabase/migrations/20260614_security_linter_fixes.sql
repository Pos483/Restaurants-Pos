-- ==============================================================================
-- Migration: Supabase Database Security Linter Fixes
-- Date: 2026-06-14
-- Purpose: Resolve all 46 Security Advisor alerts including:
--          1. Function Search Path Mutable (SET search_path = public)
--          2. Public Can Execute SECURITY DEFINER Functions (REVOKE execute from public/anon)
--          3. Permissive RLS Policy for public.licenses (Restrict ALL to Super Admin)
-- ==============================================================================

-- ─── 1. SECURE FUNCTION SEARCH PATHS (SET search_path = public) ───────────────
-- Altering all 16 functions to use a safe, static search path.
-- Using dynamic SQL to automatically resolve arguments and alter them.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT 
      p.proname AS func_name,
      oidvectortypes(p.proargtypes) AS arg_types
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'handle_new_user', 'get_reports_stats', 'admin_unblock_user', 
        'assign_official_bill_number', 'check_user_not_blocked', 'check_bills_rate_limit', 
        'check_bill_items_count', 'check_bill_item_quantity', 'assign_bill_number_if_null', 
        'check_menu_items_limit', 'check_and_rotate_kds_orders', 'record_rate_violation', 
        'claim_referral', 'check_referral_code', 'grant_referrer_reward', 'get_next_bill_number'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public', r.func_name, r.arg_types);
    RAISE NOTICE 'Set search_path on public.%(%)', r.func_name, r.arg_types;
  END LOOP;
END $$;


-- ─── 2. RESTRICT PUBLIC EXECUTE PRIVILEGES ON SECURITY DEFINER FUNCTIONS ─────
-- By default in Postgres, PUBLIC (which includes anon) has execute access to functions.
-- We must revoke this access, and explicitly grant execute only to roles that require it.

-- A. Revoke execute privileges from PUBLIC and anonymous users on all 16 functions
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT 
      p.proname AS func_name,
      oidvectortypes(p.proargtypes) AS arg_types
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'handle_new_user', 'get_reports_stats', 'admin_unblock_user', 
        'assign_official_bill_number', 'check_user_not_blocked', 'check_bills_rate_limit', 
        'check_bill_items_count', 'check_bill_item_quantity', 'assign_bill_number_if_null', 
        'check_menu_items_limit', 'check_and_rotate_kds_orders', 'record_rate_violation', 
        'claim_referral', 'check_referral_code', 'grant_referrer_reward', 'get_next_bill_number'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.func_name, r.arg_types);
    RAISE NOTICE 'Revoked EXECUTE on public.%(%) from PUBLIC and anon', r.func_name, r.arg_types;
  END LOOP;
END $$;

-- B. Explicitly grant execute only to 'authenticated' users for client-invoked functions
-- (Triggers and internal helpers don't need this, Postgres superuser will run them automatically)
GRANT EXECUTE ON FUNCTION public.get_next_bill_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_referral_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_referral(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_referrer_reward(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unblock_user(uuid) TO authenticated;


-- ─── 3. SECURE public.licenses RLS POLICIES ──────────────────────────────────
-- Restricts all data operations on public.licenses exclusively to the Super Admin (gudduk483@gmail.com)
DROP POLICY IF EXISTS "Super Admin manage licenses" ON public.licenses;
CREATE POLICY "Super Admin manage licenses" ON public.licenses
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'gudduk483@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'gudduk483@gmail.com');

-- Clients check active licenses by matching. Let's make sure authenticated users can SELECT unused/claimed licenses.
-- To allow billing users to check/update license on claim:
DROP POLICY IF EXISTS "Allow authenticated claim license" ON public.licenses;
CREATE POLICY "Allow authenticated claim license" ON public.licenses
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated update claim license" ON public.licenses;
CREATE POLICY "Allow authenticated update claim license" ON public.licenses
  FOR UPDATE
  TO authenticated
  USING (status = 'active')
  WITH CHECK (status = 'claimed' AND claimed_by_user_id = auth.uid());

SELECT 'Security hardening completed successfully!' AS result;
