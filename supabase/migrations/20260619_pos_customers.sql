-- =====================================================
-- Siya Bill - Create pos_customers Table Migration
-- Run this in Supabase Dashboard → SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS public.pos_customers (
  app_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  birthday TEXT,
  visit_count INTEGER DEFAULT 0,
  total_spent NUMERIC DEFAULT 0.0,
  last_visit BIGINT,
  created_at BIGINT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (app_user_id, id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.pos_customers ENABLE ROW LEVEL SECURITY;

-- Enable Realtime (if not already enabled)
-- Since adding to publication might error if table is already in it, we use safety check or DO block
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'pos_customers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_customers;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add table to supabase_realtime publication automatically: %', SQLERRM;
END $$;

-- Create Security Policies
DROP POLICY IF EXISTS "Users can manage their own POS customers" ON public.pos_customers;
CREATE POLICY "Users can manage their own POS customers" 
  ON public.pos_customers 
  FOR ALL 
  TO authenticated 
  USING (auth.uid() = app_user_id) 
  WITH CHECK (auth.uid() = app_user_id);
