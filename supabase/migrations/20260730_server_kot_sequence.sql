-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Server-side atomic KOT number generation
-- Date: 2026-07-30
-- Purpose: Prevent duplicate KOT numbers when multiple devices generate KOTs.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_next_kot_number(p_user_id uuid, p_date text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_date text;
  v_kot_seq integer;
BEGIN
  -- Fetch current last_kot_date and kot_sequence
  SELECT last_kot_date, kot_sequence
  INTO v_last_date, v_kot_seq
  FROM restaurant_settings
  WHERE app_user_id = p_user_id
    AND id = 'global';

  -- If date changed, reset kot sequence to 1
  IF v_last_date IS NULL OR v_last_date <> p_date THEN
    UPDATE restaurant_settings
    SET kot_sequence = 2,
        last_kot_date = p_date,
        updated_at = now()
    WHERE app_user_id = p_user_id
      AND id = 'global';
    RETURN 1;
  ELSE
    UPDATE restaurant_settings
    SET kot_sequence = kot_sequence + 1,
        updated_at = now()
    WHERE app_user_id = p_user_id
      AND id = 'global';
    RETURN v_kot_seq;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_kot_number(uuid, text) TO authenticated;
