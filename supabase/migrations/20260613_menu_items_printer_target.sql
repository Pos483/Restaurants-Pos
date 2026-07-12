-- =====================================================
-- Siya Bill - Menu Items Printer Target Column
-- Run this in Supabase Dashboard → SQL Editor
-- =====================================================

-- Add printer_target column to menu_items table
-- Values: 'kitchen' (default) or 'bar'
ALTER TABLE public.menu_items 
ADD COLUMN IF NOT EXISTS printer_target TEXT DEFAULT 'kitchen';

-- Add a check constraint to ensure only valid values
ALTER TABLE public.menu_items
ADD CONSTRAINT menu_items_printer_target_check 
CHECK (printer_target IN ('kitchen', 'bar'));

SELECT 'Migration complete: printer_target column added to menu_items!' AS result;
