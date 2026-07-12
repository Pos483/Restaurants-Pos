-- ==============================================================================
-- Migration: Grant execute permission on record_rate_violation to authenticated users
-- Date: 2026-06-21
-- ==============================================================================

GRANT EXECUTE ON FUNCTION public.record_rate_violation() TO authenticated;
