-- ============================================================
-- Account Management Request System
-- Created: 2026-06-21
-- 
-- Allows users to submit delete/reset requests via POS.
-- Admin can approve/reject. Auto-executes after 24 hours.
-- ============================================================

-- Enable pg_cron if available (may already be enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── 1. account_requests Table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.account_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id     TEXT        NOT NULL,
  restaurant_name TEXT,
  email           TEXT,
  request_type    TEXT        NOT NULL CHECK (request_type IN ('delete', 'reset')),
  reason          TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'cancelled')),
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
  processed_at    TIMESTAMPTZ,
  processed_by    TEXT
);

-- Enable RLS
ALTER TABLE public.account_requests ENABLE ROW LEVEL SECURITY;

-- Users can insert their own requests
DROP POLICY IF EXISTS "users_can_create_account_requests" ON public.account_requests;
CREATE POLICY "users_can_create_account_requests"
  ON public.account_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (app_user_id = auth.uid()::TEXT);

-- Users can read their own requests (to show "pending" status in UI)
DROP POLICY IF EXISTS "users_can_read_own_account_requests" ON public.account_requests;
CREATE POLICY "users_can_read_own_account_requests"
  ON public.account_requests
  FOR SELECT
  TO authenticated
  USING (app_user_id = auth.uid()::TEXT);

-- Users can cancel their own pending requests (UPDATE status → 'cancelled')
DROP POLICY IF EXISTS "users_can_cancel_own_account_requests" ON public.account_requests;
CREATE POLICY "users_can_cancel_own_account_requests"
  ON public.account_requests
  FOR UPDATE
  TO authenticated
  USING (app_user_id = auth.uid()::TEXT AND status = 'pending')
  WITH CHECK (status = 'cancelled');

-- Super Admin can manage all account requests
DROP POLICY IF EXISTS "superadmin_manage_all_account_requests" ON public.account_requests;
CREATE POLICY "superadmin_manage_all_account_requests"
  ON public.account_requests
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'gudduk483@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'gudduk483@gmail.com');

-- Grant select/insert/update table permissions to authenticated, anon, and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_requests TO authenticated, anon, service_role;

-- ── 2. Helper: Perform Account Reset (wipe transactional data) ───────────────

CREATE OR REPLACE FUNCTION public.perform_account_reset(p_user_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Wipe transactional data only — profile, subscription, menu stay intact
  DELETE FROM public.bills             WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.kds_orders        WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.stock_transactions WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.expenses          WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.customers         WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.customer_transactions WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.pos_customers     WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.support_tickets   WHERE app_user_id::TEXT = p_user_id;

  -- Reset bill sequence to 1
  UPDATE public.restaurant_settings
  SET    bill_sequence = 1,
         kot_sequence  = 1,
         updated_at    = now()
  WHERE  app_user_id::TEXT = p_user_id;
END;
$$;

-- ── 3. Helper: Perform Account Delete (wipe ALL data for user) ───────────────

CREATE OR REPLACE FUNCTION public.perform_account_delete(p_user_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Wipe everything for this user
  DELETE FROM public.bills                 WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.kds_orders            WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.stock_transactions    WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.stock_items           WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.expenses              WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.customers             WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.customer_transactions WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.pos_customers         WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.menu_items            WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.categories            WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.restaurant_settings   WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.restaurant_profile    WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.support_tickets       WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.settings              WHERE app_user_id::TEXT = p_user_id;
  DELETE FROM public.licenses              WHERE claimed_by_user_id::TEXT = p_user_id;

  -- Delete the auth user completely
  DELETE FROM auth.users WHERE id::TEXT = p_user_id;
END;
$$;

-- ── 4. Admin Process Account Request RPC ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_process_account_request(
  p_request_id UUID,
  p_action     TEXT  -- 'approve' or 'reject'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request public.account_requests%ROWTYPE;
BEGIN
  -- Verify caller is the super admin
  IF auth.jwt() ->> 'email' <> 'gudduk483@gmail.com' THEN
    RAISE EXCEPTION 'Access Denied: Only superadmin can call this function.';
  END IF;

  -- Fetch the request
  SELECT * INTO v_request
  FROM   public.account_requests
  WHERE  id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already processed (id: %)', p_request_id;
  END IF;

  IF p_action = 'approve' THEN
    -- Execute the actual action
    IF v_request.request_type = 'reset' THEN
      PERFORM public.perform_account_reset(v_request.app_user_id);
    ELSIF v_request.request_type = 'delete' THEN
      PERFORM public.perform_account_delete(v_request.app_user_id);
    END IF;

    -- Mark as approved + executed
    UPDATE public.account_requests
    SET    status       = 'executed',
           processed_at = now(),
           processed_by = 'admin_manual'
    WHERE  id = p_request_id;

  ELSIF p_action = 'reject' THEN
    -- Simply reject
    UPDATE public.account_requests
    SET    status       = 'rejected',
           processed_at = now(),
           processed_by = 'admin_manual'
    WHERE  id = p_request_id;

  ELSE
    RAISE EXCEPTION 'Invalid action: %. Must be ''approve'' or ''reject''.', p_action;
  END IF;
END;
$$;

-- Grant execute to authenticated (only superadmin will pass the email check) and service_role
GRANT EXECUTE ON FUNCTION public.admin_process_account_request(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.perform_account_reset(TEXT)               TO service_role;
GRANT EXECUTE ON FUNCTION public.perform_account_delete(TEXT)              TO service_role;

-- ── 5. Auto-Execute: Process Expired Requests (called by pg_cron) ───────────

CREATE OR REPLACE FUNCTION public.process_expired_account_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request public.account_requests%ROWTYPE;
BEGIN
  FOR v_request IN
    SELECT * FROM public.account_requests
    WHERE  status = 'pending'
    AND    expires_at < now()
  LOOP
    BEGIN
      IF v_request.request_type = 'reset' THEN
        PERFORM public.perform_account_reset(v_request.app_user_id);
      ELSIF v_request.request_type = 'delete' THEN
        PERFORM public.perform_account_delete(v_request.app_user_id);
      END IF;

      UPDATE public.account_requests
      SET    status       = 'executed',
             processed_at = now(),
             processed_by = 'auto_cron'
      WHERE  id = v_request.id;

    EXCEPTION WHEN OTHERS THEN
      -- Log but continue processing other requests
      RAISE WARNING 'Failed to process account request %: %', v_request.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ── 6. Schedule pg_cron Job (runs every 15 minutes) ─────────────────────────

-- Remove existing job if re-running migration
SELECT cron.unschedule('process-account-requests')
WHERE  EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-account-requests'
);

SELECT cron.schedule(
  'process-account-requests',
  '*/15 * * * *',
  'SELECT public.process_expired_account_requests()'
);
