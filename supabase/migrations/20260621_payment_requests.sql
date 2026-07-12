-- ============================================================
-- Direct UPI Payment & UTR Verification Request System
-- Created: 2026-06-21
-- 
-- Stores direct payment requests matching dynamic pricing plans.
-- Admin reviews UTR number and approves to instantly activate premium.
-- ============================================================

-- ── 1. payment_requests Table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payment_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id     TEXT        NOT NULL,
  restaurant_code TEXT        NOT NULL,
  restaurant_name TEXT,
  plan_id         TEXT        NOT NULL, -- 'monthly' | 'half-yearly' | 'yearly' | 'lifetime'
  plan_name       TEXT        NOT NULL,
  amount          NUMERIC     NOT NULL,
  utr             TEXT        NOT NULL UNIQUE,
  status          TEXT        NOT NULL DEFAULT 'pending' 
                              CHECK (status IN ('pending', 'approved', 'rejected')),
  license_key     TEXT,
  admin_notes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ,
  processed_by    TEXT
);

-- Enable RLS
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

-- Users can insert their own payment requests
DROP POLICY IF EXISTS "users_can_create_payment_requests" ON public.payment_requests;
CREATE POLICY "users_can_create_payment_requests"
  ON public.payment_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (app_user_id = auth.uid()::TEXT);

-- Users can read their own payment requests
DROP POLICY IF EXISTS "users_can_read_own_payment_requests" ON public.payment_requests;
CREATE POLICY "users_can_read_own_payment_requests"
  ON public.payment_requests
  FOR SELECT
  TO authenticated
  USING (app_user_id = auth.uid()::TEXT);

-- Users can delete their own payment requests
DROP POLICY IF EXISTS "users_can_delete_own_payment_requests" ON public.payment_requests;
CREATE POLICY "users_can_delete_own_payment_requests"
  ON public.payment_requests
  FOR DELETE
  TO authenticated
  USING (app_user_id = auth.uid()::TEXT);

-- Super Admin can manage all payment requests
DROP POLICY IF EXISTS "superadmin_manage_all_payment_requests" ON public.payment_requests;
CREATE POLICY "superadmin_manage_all_payment_requests"
  ON public.payment_requests
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'gudduk483@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'gudduk483@gmail.com');

-- Grant permissions to authenticated, anon, and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_requests TO authenticated, anon, service_role;


-- ── 2. Admin Process Payment Request RPC Function ───────────────────────────

CREATE OR REPLACE FUNCTION public.admin_process_payment_request(
  p_request_id    UUID,
  p_action        TEXT,           -- 'approve' or 'reject'
  p_license_key   TEXT,           -- generated key if approved
  p_duration_days INTEGER,        -- plan duration (30, 180, 365, 99999)
  p_admin_notes   TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.payment_requests%ROWTYPE;
  v_now_ms  BIGINT;
  v_target_expiry BIGINT;
  v_current_status TEXT;
  v_current_expiry BIGINT;
BEGIN
  -- Verify caller is the super admin
  IF auth.jwt() ->> 'email' <> 'gudduk483@gmail.com' THEN
    RAISE EXCEPTION 'Access Denied: Only superadmin can call this function.';
  END IF;

  -- Fetch the request
  SELECT * INTO v_request
  FROM   public.payment_requests
  WHERE  id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment request not found or already processed (id: %)', p_request_id;
  END IF;

  IF p_action = 'approve' THEN
    -- Calculate new subscription expiry timestamp in ms
    v_now_ms := extract(epoch from now())::BIGINT * 1000;
    
    -- Check user's current subscription expiry
    SELECT subscription_status, subscription_expiry 
    INTO v_current_status, v_current_expiry
    FROM public.restaurant_profile
    WHERE app_user_id = v_request.app_user_id::UUID;

    -- If user has currently active premium time, stack the new duration on top of it
    IF v_current_status = 'premium' AND v_current_expiry > v_now_ms THEN
      v_target_expiry := v_current_expiry + (p_duration_days::BIGINT * 24 * 60 * 60 * 1000);
    ELSE
      v_target_expiry := v_now_ms + (p_duration_days::BIGINT * 24 * 60 * 60 * 1000);
    END IF;

    -- 1. Update restaurant profile with new plan, expiry, and key
    UPDATE public.restaurant_profile
    SET
      subscription_status = 'premium',
      subscription_plan   = v_request.plan_id,
      subscription_expiry = v_target_expiry,
      license_key         = p_license_key,
      updated_at          = now()
    WHERE app_user_id = v_request.app_user_id::UUID;

    -- 2. Insert generated key into licenses master table as claimed
    INSERT INTO public.licenses (
      license_key, plan_type, expiry_days, status, restaurant_code, claimed_by_user_id, claimed_at, created_at
    ) VALUES (
      p_license_key, 
      CASE 
        WHEN v_request.plan_id = 'monthly' THEN 'monthly'
        WHEN v_request.plan_id = 'half-yearly' THEN 'half-yearly'
        WHEN v_request.plan_id = 'yearly' THEN 'yearly'
        ELSE 'lifetime'
      END,
      p_duration_days,
      'claimed',
      v_request.restaurant_code,
      v_request.app_user_id::UUID,
      now(),
      now()
    );

    -- 3. Mark payment request as approved
    UPDATE public.payment_requests
    SET
      status       = 'approved',
      license_key  = p_license_key,
      admin_notes  = p_admin_notes,
      processed_at = now(),
      processed_by = 'admin_manual'
    WHERE id = p_request_id;

  ELSIF p_action = 'reject' THEN
    -- Simply reject
    UPDATE public.payment_requests
    SET
      status       = 'rejected',
      admin_notes  = p_admin_notes,
      processed_at = now(),
      processed_by = 'admin_manual'
    WHERE id = p_request_id;

  ELSE
    RAISE EXCEPTION 'Invalid action: %. Must be ''approve'' or ''reject''.', p_action;
  END IF;
END;
$$;

-- Grant execute privileges to authenticated (only superadmin will pass the email check) and service_role
GRANT EXECUTE ON FUNCTION public.admin_process_payment_request(UUID, TEXT, TEXT, INTEGER, TEXT) TO authenticated, service_role;
