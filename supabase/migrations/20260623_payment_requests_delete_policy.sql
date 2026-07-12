-- ============================================================
-- Migration: Allow Users to Delete Their Own Payment Requests
-- Created: 2026-06-23
-- 
-- Fixes the "Dismiss & Try Again" button issue by permitting
-- authenticated users to delete their own payment request records.
-- ============================================================

-- Users can delete their own payment requests
DROP POLICY IF EXISTS "users_can_delete_own_payment_requests" ON public.payment_requests;
CREATE POLICY "users_can_delete_own_payment_requests"
  ON public.payment_requests
  FOR DELETE
  TO authenticated
  USING (app_user_id = auth.uid()::TEXT);
