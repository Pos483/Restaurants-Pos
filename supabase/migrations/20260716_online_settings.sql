-- Add columns for online delivery and takeaway toggles to restaurant_settings
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS online_delivery_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS online_takeaway_enabled BOOLEAN DEFAULT TRUE;

-- Allow public read access to settings so customer page can fetch delivery/takeaway toggles
ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select on restaurant_settings" ON public.restaurant_settings;
CREATE POLICY "Allow public select on restaurant_settings" 
    ON public.restaurant_settings
    FOR SELECT 
    TO public 
    USING (true);
