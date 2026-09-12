-- =====================================================
-- Siya Bill - Counter Cash & Denomination Closing Table Migration
-- =====================================================

CREATE TABLE IF NOT EXISTS public.counter_cash (
  app_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  cashier_name TEXT,
  notes_500 NUMERIC DEFAULT 0,
  notes_200 NUMERIC DEFAULT 0,
  notes_100 NUMERIC DEFAULT 0,
  notes_50 NUMERIC DEFAULT 0,
  notes_20 NUMERIC DEFAULT 0,
  notes_10 NUMERIC DEFAULT 0,
  notes_5 NUMERIC DEFAULT 0,
  coins_20 NUMERIC DEFAULT 0,
  coins_10 NUMERIC DEFAULT 0,
  coins_5 NUMERIC DEFAULT 0,
  coins_2 NUMERIC DEFAULT 0,
  coins_1 NUMERIC DEFAULT 0,
  total_cash NUMERIC DEFAULT 0,
  big_notes_total NUMERIC DEFAULT 0,
  small_notes_coins_total NUMERIC DEFAULT 0,
  owner_withdrawal NUMERIC DEFAULT 0,
  counter_closing_float NUMERIC DEFAULT 0,
  expected_cash NUMERIC,
  discrepancy NUMERIC,
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (app_user_id, id)
);

-- Enable RLS
ALTER TABLE public.counter_cash ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON public.counter_cash TO authenticated, service_role, anon;

-- Realtime Publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'counter_cash'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.counter_cash;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add counter_cash to supabase_realtime: %', SQLERRM;
END $$;

-- Policy
DROP POLICY IF EXISTS "Users can manage their own counter_cash" ON public.counter_cash;
CREATE POLICY "Users can manage their own counter_cash" 
  ON public.counter_cash 
  FOR ALL 
  USING (auth.uid() = app_user_id) 
  WITH CHECK (auth.uid() = app_user_id);
