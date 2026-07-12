-- ============================================================
-- Enable Supabase Realtime Replication for All POS Tables
-- Created: 2026-06-23
-- 
-- Adds all tables to the supabase_realtime publication to ensure
-- database modifications are instantly broadcast to all POS clients.
-- ============================================================

DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'bills', 
    'menu_items', 
    'categories', 
    'restaurant_profile', 
    'restaurant_settings', 
    'active_orders', 
    'stock_items', 
    'stock_transactions', 
    'kds_orders', 
    'customers', 
    'customer_transactions', 
    'expenses', 
    'pos_customers',
    'payment_requests',
    'account_requests',
    'settings',
    'support_tickets',
    'licenses'
  ];
  v_table TEXT;
BEGIN
  -- Create publication if it does not exist (usually handled by Supabase)
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
    RAISE NOTICE 'Created supabase_realtime publication.';
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    -- Check if table exists in the public schema
    IF EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = v_table
    ) THEN
      -- Check if table is already in the publication
      IF NOT EXISTS (
        SELECT 1 
        FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = v_table
      ) THEN
        BEGIN
          EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
          RAISE NOTICE 'Table public.% added to supabase_realtime publication successfully.', v_table;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Could not add table public.% to publication: %', v_table, SQLERRM;
        END;
      ELSE
        RAISE NOTICE 'Table public.% is already in supabase_realtime publication.', v_table;
      END IF;
    ELSE
      RAISE NOTICE 'Table public.% does not exist, skipping.', v_table;
    END IF;
  END LOOP;
END $$;
