-- =====================================================
-- Siya Bill - Staff Attendance & Advance Payment System Migration
-- Run this script in Supabase Dashboard → SQL Editor to fix "permission denied for table staff"
-- =====================================================

-- 1. Create public.staff Table
CREATE TABLE IF NOT EXISTS public.staff (
  app_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'waiter',
  phone TEXT,
  salary NUMERIC DEFAULT 0,
  salary_type TEXT NOT NULL DEFAULT 'monthly',
  allowed_leaves NUMERIC DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'active',
  joining_date TEXT,
  timestamp BIGINT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (app_user_id, id)
);

-- Add column if table was created previously without allowed_leaves
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS allowed_leaves NUMERIC DEFAULT 4;

-- 2. Create public.staff_attendance Table
CREATE TABLE IF NOT EXISTS public.staff_attendance (
  app_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'present',
  check_in_time TEXT,
  check_out_time TEXT,
  note TEXT,
  timestamp BIGINT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (app_user_id, id)
);

-- 3. Create public.staff_advances Table
CREATE TABLE IF NOT EXISTS public.staff_advances (
  app_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  date TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'advance',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  note TEXT,
  timestamp BIGINT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (app_user_id, id)
);

-- ── Enable Row Level Security (RLS) ──────────────────
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_advances ENABLE ROW LEVEL SECURITY;

-- ── Grant Table Permissions to Database Roles ────────
GRANT ALL ON public.staff TO authenticated, service_role, anon;
GRANT ALL ON public.staff_attendance TO authenticated, service_role, anon;
GRANT ALL ON public.staff_advances TO authenticated, service_role, anon;

-- ── Enable Realtime Replication ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'staff'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'staff_attendance'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_attendance;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'staff_advances'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_advances;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add tables to supabase_realtime publication: %', SQLERRM;
END $$;

-- ── Create Security Policies (RLS) ───────────────────

-- Policies for public.staff
DROP POLICY IF EXISTS "Users can manage their own staff" ON public.staff;
CREATE POLICY "Users can manage their own staff" 
  ON public.staff 
  FOR ALL 
  TO authenticated 
  USING (auth.uid() = app_user_id) 
  WITH CHECK (auth.uid() = app_user_id);

-- Policies for public.staff_attendance
DROP POLICY IF EXISTS "Users can manage their own staff attendance" ON public.staff_attendance;
CREATE POLICY "Users can manage their own staff attendance" 
  ON public.staff_attendance 
  FOR ALL 
  TO authenticated 
  USING (auth.uid() = app_user_id) 
  WITH CHECK (auth.uid() = app_user_id);

-- Policies for public.staff_advances
DROP POLICY IF EXISTS "Users can manage their own staff advances" ON public.staff_advances;
CREATE POLICY "Users can manage their own staff advances" 
  ON public.staff_advances 
  FOR ALL 
  TO authenticated 
  USING (auth.uid() = app_user_id) 
  WITH CHECK (auth.uid() = app_user_id);

-- Notify Supabase PostgREST engine to reload schema cache
NOTIFY pgrst, 'reload schema';
