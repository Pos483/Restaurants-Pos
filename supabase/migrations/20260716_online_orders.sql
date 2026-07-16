-- Create online_orders table
CREATE TABLE IF NOT EXISTS public.online_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    order_type TEXT NOT NULL CHECK (order_type IN ('delivery', 'takeaway')),
    delivery_address TEXT, -- Null for takeaway
    pickup_time TEXT,      -- Null for delivery
    payment_method TEXT NOT NULL CHECK (payment_method = 'UPI'),
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
    items JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'preparing', 'dispatched', 'delivered', 'rejected')),
    est_prep_time INTEGER, -- In minutes
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;

-- Enable Realtime for online_orders table
ALTER PUBLICATION supabase_realtime ADD TABLE public.online_orders;

-- Grant permissions to database roles
GRANT ALL ON public.online_orders TO authenticated;
GRANT INSERT, SELECT ON public.online_orders TO anon, authenticated;

-- RLS Policies
-- 1. Owner full access
CREATE POLICY "Allow owner full access on online_orders" 
    ON public.online_orders
    FOR ALL 
    TO authenticated 
    USING (auth.uid() = app_user_id) 
    WITH CHECK (auth.uid() = app_user_id);

-- 2. Public can insert online orders
CREATE POLICY "Allow public insert on online_orders" 
    ON public.online_orders
    FOR INSERT 
    TO public 
    WITH CHECK (true);

-- 3. Public can select online orders (to monitor status)
CREATE POLICY "Allow public select on online_orders" 
    ON public.online_orders
    FOR SELECT 
    TO public 
    USING (true);
