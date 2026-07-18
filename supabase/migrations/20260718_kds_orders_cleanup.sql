-- ============================================================
-- KOT / KDS Orders Auto-Cleanup Migration
-- Schedules a pg_cron job to delete KDS orders (KOTs)
-- older than 30 days from the server to prevent storage issues.
-- ============================================================

-- Schedule KOT cleanup job to run every day at midnight (00:00 UTC)
SELECT cron.schedule(
  'cleanup-old-kds-orders',
  '0 0 * * *',  -- Run daily at midnight
  $$
    DELETE FROM public.kds_orders
    WHERE timestamp < (extract(epoch from (now() - interval '30 days')) * 1000);
  $$
);
