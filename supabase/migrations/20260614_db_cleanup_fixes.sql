-- =====================================================
-- Siya Bill - Database Cleanup & Fixes Migration
-- Date: 2026-06-14
-- =====================================================

-- ─── 1. DROP unused system_settings table ─────────────
DROP TABLE IF EXISTS public.system_settings;

-- ─── 2. Fix stock_transactions FK if needed ───────────
-- Check if the constraint naming is wrong
DO $$
BEGIN
  -- Drop the constraint if it exists with wrong name
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'
      AND c.conname = 'fk_stock_transactions_stock_item'
      AND c.conrelid = 'public.stock_transactions'::regclass
  ) THEN
    -- Already has correct constraint names, nothing to do
    RAISE NOTICE 'stock_transactions FKs already correct';
  ELSE
    -- Drop the potentially duplicate-named constraint
    BEGIN
      ALTER TABLE public.stock_transactions DROP CONSTRAINT IF EXISTS fk_stock_transactions_item;
    EXCEPTION WHEN undefined_object THEN
      RAISE NOTICE 'fk_stock_transactions_item not found, skipping drop';
    END;

    -- Add user FK if missing
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
        AND c.conname = 'fk_stock_transactions_user'
        AND c.conrelid = 'public.stock_transactions'::regclass
    ) THEN
      ALTER TABLE public.stock_transactions
        ADD CONSTRAINT fk_stock_transactions_user
          FOREIGN KEY (app_user_id) REFERENCES auth.users(id);
    END IF;

    -- Add stock_item FK if missing
    -- Note: stock_items has composite PK (app_user_id, id), so we reference both
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
        AND c.conname = 'fk_stock_transactions_stock_item'
        AND c.conrelid = 'public.stock_transactions'::regclass
    ) THEN
      ALTER TABLE public.stock_transactions
        ADD CONSTRAINT fk_stock_transactions_stock_item
          FOREIGN KEY (app_user_id, stock_item_id) REFERENCES public.stock_items(app_user_id, id);
    END IF;
  END IF;
END $$;

-- ─── 3. Add missing FK on support_tickets ─────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'
      AND c.conname = 'fk_support_tickets_user'
      AND c.conrelid = 'public.support_tickets'::regclass
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT fk_support_tickets_user
        FOREIGN KEY (app_user_id) REFERENCES auth.users(id);
  END IF;
END $$;

SELECT 'Migration complete!' AS result;
