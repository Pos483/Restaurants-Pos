-- Add unique constraint to online_orders to support upsert on (app_user_id, id) conflict
ALTER TABLE public.online_orders DROP CONSTRAINT IF EXISTS online_orders_app_user_id_id_key;
ALTER TABLE public.online_orders ADD CONSTRAINT online_orders_app_user_id_id_key UNIQUE (app_user_id, id);
