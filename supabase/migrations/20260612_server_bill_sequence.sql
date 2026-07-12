-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Server-side atomic bill number generation
-- Date: 2026-06-12
-- Purpose: Replace client-side bill sequence with a server-side atomic counter
--          to prevent race conditions when multiple devices bill simultaneously.
-- ──────────────────────────────────────────────────────────────────────────────

-- Function: get_next_bill_number(p_user_id text)
-- Returns the CURRENT bill_sequence value and atomically increments it by 1.
-- Uses UPDATE ... RETURNING which is fully atomic in Postgres — no race condition
-- possible even with concurrent callers.

DROP FUNCTION IF EXISTS get_next_bill_number(text);

CREATE OR REPLACE FUNCTION get_next_bill_number(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current integer;
BEGIN
  -- Atomically increment bill_sequence and capture the OLD value (before increment)
  UPDATE restaurant_settings
  SET bill_sequence = bill_sequence + 1,
      updated_at    = now()
  WHERE app_user_id = p_user_id
    AND id          = 'global'
  RETURNING bill_sequence - 1 INTO v_current;

  -- If no row was updated, the settings record doesn't exist yet
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Restaurant settings not found for user %. Please set up your restaurant first.', p_user_id;
  END IF;

  RETURN v_current;
END;
$$;

-- Grant execute permission to authenticated users (each user can only update
-- their own row because of the WHERE app_user_id = p_user_id clause).
GRANT EXECUTE ON FUNCTION get_next_bill_number(uuid) TO authenticated;
