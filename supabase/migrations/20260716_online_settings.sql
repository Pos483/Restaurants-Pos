-- Add columns for online delivery and takeaway toggles to restaurant_settings
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS online_delivery_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS online_takeaway_enabled BOOLEAN DEFAULT TRUE;
