-- =====================================================
-- Siya Bill - Referral System DB Migration (Updated)
-- Run this in Supabase Dashboard → SQL Editor
-- =====================================================

-- 1. Add referral columns to restaurant_profile table if they do not exist
ALTER TABLE public.restaurant_profile
ADD COLUMN IF NOT EXISTS referred_by TEXT,
ADD COLUMN IF NOT EXISTS referral_claimed BOOLEAN DEFAULT FALSE;

-- 2. Create RPC function to check and register referral code (without giving 30-day reward yet)
CREATE OR REPLACE FUNCTION public.check_referral_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with owner privileges, bypassing RLS
AS $$
DECLARE
  v_claimant_uid UUID;
  v_claimant_code TEXT;
  v_claimant_claimed BOOLEAN;
  v_referrer_uid UUID;
BEGIN
  -- Get active user ID
  v_claimant_uid := auth.uid();
  IF v_claimant_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: User not authenticated');
  END IF;

  -- Get claimant details
  SELECT restaurant_code, referral_claimed
  INTO v_claimant_code, v_claimant_claimed
  FROM public.restaurant_profile
  WHERE app_user_id = v_claimant_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Restaurant profile not found');
  END IF;

  -- Check if already claimed
  IF COALESCE(v_claimant_claimed, false) = true THEN
    RETURN jsonb_build_object('success', false, 'message', 'You have already registered a referral code!');
  END IF;

  -- Check if self referral
  IF UPPER(p_code) = UPPER(v_claimant_code) THEN
    RETURN jsonb_build_object('success', false, 'message', 'You cannot refer your own restaurant!');
  END IF;

  -- Find referrer
  SELECT app_user_id
  INTO v_referrer_uid
  FROM public.restaurant_profile
  WHERE UPPER(restaurant_code) = UPPER(p_code);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid Referral Code! Please verify the code.');
  END IF;

  -- Register referral (mark referral_claimed as true, referred_by as p_code)
  UPDATE public.restaurant_profile
  SET 
    referral_claimed = true,
    referred_by = UPPER(p_code),
    updated_at = NOW()
  WHERE app_user_id = v_claimant_uid;

  RETURN jsonb_build_object(
    'success', true, 
    'message', '🎉 Referral code registered! You and your referrer will get 30 Days Premium extra when you activate a 12-Month or Lifetime plan.',
    'referred_by', UPPER(p_code)
  );
END;
$$;


-- 3. Create RPC function to grant referral reward to the referrer when referee upgrades
CREATE OR REPLACE FUNCTION public.grant_referrer_reward(p_referrer_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with owner privileges, bypassing RLS
AS $$
DECLARE
  v_claimant_uid UUID;
  v_referrer_uid UUID;
  v_referrer_expiry BIGINT;
  v_now_ms BIGINT;
  v_reward_ms BIGINT := 30::BIGINT * 24 * 60 * 60 * 1000; -- 30 Days in milliseconds
BEGIN
  -- Get active user ID (referee who is upgrading)
  v_claimant_uid := auth.uid();
  IF v_claimant_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: User not authenticated');
  END IF;

  -- Find referrer
  SELECT app_user_id, subscription_expiry
  INTO v_referrer_uid, v_referrer_expiry
  FROM public.restaurant_profile
  WHERE UPPER(restaurant_code) = UPPER(p_referrer_code);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Referrer not found');
  END IF;

  v_now_ms := extract(epoch from now())::BIGINT * 1000;

  -- Update referrer profile: Add 30 days premium
  UPDATE public.restaurant_profile
  SET 
    subscription_status = 'premium',
    subscription_expiry = CASE 
      WHEN subscription_expiry IS NULL OR subscription_expiry < v_now_ms THEN v_now_ms + v_reward_ms
      ELSE subscription_expiry + v_reward_ms
    END,
    updated_at = NOW()
  WHERE app_user_id = v_referrer_uid;

  -- Update claimant's profile to mark referred_by_reward_granted = true
  UPDATE public.restaurant_profile
  SET 
    referred_by_reward_granted = true,
    updated_at = NOW()
  WHERE app_user_id = v_claimant_uid;

  RETURN jsonb_build_object(
    'success', true, 
    'message', '🎉 Referral reward of 30 days granted to referrer successfully!'
  );
END;
$$;
