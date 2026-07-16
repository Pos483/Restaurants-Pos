-- ============================================================
-- Fake Order Protection Migration
-- 1. Add client_ip column to online_orders
-- 2. RLS: IP rate limit (100 orders/hour per IP)  
-- 3. RLS: Phone rate limit (5 orders/hour per phone)
-- 4. pg_cron: Auto-delete pending (24h) + rejected/cancelled (7d)
-- NOTE: delivered orders are NEVER deleted
-- ============================================================

-- Step 1: Add client_ip column to store customer IP
ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS client_ip TEXT;

-- Step 2: Drop existing permissive public insert policy
DROP POLICY IF EXISTS "Allow public insert on online_orders" ON public.online_orders;

-- Step 3: RLS Policy — IP Rate Limit (max 100 orders per IP per hour)
-- Prevents automated bot attacks from filling up database storage
CREATE POLICY "Rate limit by IP: max 100 per hour"
  ON public.online_orders
  FOR INSERT
  TO public
  WITH CHECK (
    client_ip IS NULL
    OR (
      SELECT COUNT(*)
      FROM public.online_orders oo
      WHERE oo.client_ip = client_ip
        AND oo.created_at > (now() - INTERVAL '1 hour')
    ) < 100
  );

-- Step 4: RLS Policy — Phone Rate Limit (max 5 orders per phone per hour)
-- Prevents spam from same phone number
CREATE POLICY "Rate limit by phone: max 5 per hour"
  ON public.online_orders
  FOR INSERT
  TO public
  WITH CHECK (
    customer_phone IS NULL
    OR customer_phone = ''
    OR (
      SELECT COUNT(*)
      FROM public.online_orders oo
      WHERE oo.customer_phone = customer_phone
        AND oo.created_at > (now() - INTERVAL '1 hour')
    ) < 5
  );

-- ============================================================
-- Step 5: pg_cron Auto-Delete Job
-- Run this block SEPARATELY in Supabase Dashboard SQL Editor
-- after enabling pg_cron extension from:
-- Dashboard > Database > Extensions > pg_cron (Enable)
-- ============================================================

-- SELECT cron.schedule(
--   'cleanup-fake-online-orders',
--   '0 * * * *',
--   $$
--     DELETE FROM public.online_orders
--     WHERE
--       -- Fake/abandoned orders: pending more than 24 hours
--       (status = 'pending' AND created_at < now() - INTERVAL '24 hours')
--       OR
--       -- Rejected/cancelled orders older than 7 days
--       (status IN ('rejected', 'cancelled') AND created_at < now() - INTERVAL '7 days');
--     -- NOTE: 'delivered' and 'accepted' orders are NEVER deleted (business records)
--   $$
-- );
