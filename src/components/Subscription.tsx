import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle2, ShieldCheck, KeyRound, Copy, HelpCircle, PhoneCall, Gift, Zap, X, CreditCard, Loader2, Clock } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../db';
import { parseAndValidateLicense } from '../utils/license';
import { useToast } from './Toast';
import { supabase } from '../supabase';
import { logger } from '../utils/logger';

export default function Subscription({ 
  subscriptionState,
  onActivationSuccess 
}: { 
  subscriptionState: {
    isPremium: boolean;
    isTrial: boolean;
    isExpired: boolean;
    daysLeft: number;
    settings: any;
  };
  onActivationSuccess?: () => void;
}) {
  const { showToast } = useToast();
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [isApplyingReferral, setIsApplyingReferral] = useState(false);
  const [restaurantCode, setRestaurantCode] = useState('');

  // States for UPI Payment Request Modal
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState<any>(null);
  const [paymentMethodChoice, setPaymentMethodChoice] = useState<'options' | 'qr' | 'whatsapp'>('options');
  const [utrInput, setUtrInput] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<any>(null);

  // Dynamic Admin UPI settings states
  const [upiId1, setUpiId1] = useState('8677994666@upi');
  const [upiId2, setUpiId2] = useState('gudduk483@okaxis');
  const [selectedUpiId, setSelectedUpiId] = useState('8677994666@upi');

  const { settings, isTrial, isExpired, daysLeft } = subscriptionState;

  // H-14: Helper to safely update settings, falling back to put() if record is missing
  const safeUpdateSettings = async (data: Record<string, any>) => {
    const updated = await db.restaurantProfile.update('global', data);
    if (updated === 0) {
      const existing = (await Promise.all([db.restaurantProfile.get('global'), db.restaurantSettings.get('global')])).reduce((a,b)=>({...(a||{}), ...(b||{})}), {});
      await db.restaurantProfile.put({ id: 'global', ...existing, ...data } as any);
    }
  };

  const isLifetime = settings?.subscriptionPlan === 'lifetime' || daysLeft > 5000;
  const expiryFormatted = settings?.subscriptionExpiry
    ? new Date(settings.subscriptionExpiry).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    : '';

  // Load dynamic pricing and features from Supabase
  const [plans, setPlans] = useState<any>({
    monthly: { price: 999, features: ['Quick Billing & KOT', 'KDS & Stock Manager', 'Realtime Cloud Sync'] },
    halfYearly: { price: 4999, features: ['Quick Billing & KOT', 'KDS & Stock Manager', 'Realtime Cloud Sync'] },
    yearly: { price: 7999, features: ['Quick Billing & KOT', 'KDS & Stock Manager', 'Realtime Cloud Sync'] }
  });
  const [dynamicPlans, setDynamicPlans] = useState<any[]>([]);

  useEffect(() => {
    const loadPricingPlans = async () => {
      if (!supabase) return;
      try {
        // 1. Try querying from the new subscription_plans table first
        const { data: specPlans, error: specError } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('is_active', true)
          .order('price', { ascending: true });

        if (!specError && specPlans && specPlans.length > 0) {
          setDynamicPlans(specPlans);
          return;
        }

        // 2. Fallback to old pricing_plans row in settings
        const { data, error } = await supabase
          .from('settings')
          .select('data')
          .eq('id', 'pricing_plans')
          .maybeSingle();

        if (!error && data && data.data) {
          setPlans(data.data);
        }
      } catch (err) {
        console.error('Failed to load pricing plans from cloud:', err);
      }
    };
    loadPricingPlans();
  }, []);

  // Initialize or fetch the restaurant code
  useEffect(() => {
    const initRestaurantCode = async () => {
      if (settings) {
        if (settings.restaurantCode) {
          setRestaurantCode(settings.restaurantCode);
        } else {
          // Generate a brand new unique Restaurant Code if missing
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          let newCode = 'RES-';
          for (let i = 0; i < 6; i++) {
            newCode += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          await safeUpdateSettings({ restaurantCode: newCode });
          setRestaurantCode(newCode);
        }
      }
    };
    initRestaurantCode();
  }, [settings]);

  const copyToClipboard = () => {
    if (!restaurantCode) return;
    navigator.clipboard.writeText(restaurantCode);
    showToast('📋 Restaurant Code copied to clipboard!', 'success');
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKeyInput.trim()) {
      showToast('Please enter a license key!', 'error');
      return;
    }

    setIsActivating(true);
    try {
      const validation = await parseAndValidateLicense(licenseKeyInput.trim(), restaurantCode);
      if (!validation.isValid || !validation.expiry || !validation.plan) {
        showToast(validation.message, 'error');
        setIsActivating(false);
        return;
      }

      let planDuration = 0;
      if (validation.plan === 'monthly') planDuration = 30 * 24 * 60 * 60 * 1000;
      else if (validation.plan === 'half-yearly') planDuration = 180 * 24 * 60 * 60 * 1000;
      else if (validation.plan === 'yearly') planDuration = 365 * 24 * 60 * 60 * 1000;

      let finalExpiry = validation.expiry;

      // If user has active premium time, stack the new duration on top of it
      const isCurrentlyPremium = settings?.subscriptionStatus === 'premium' && settings?.subscriptionExpiry && settings.subscriptionExpiry > Date.now();
      
      if (validation.plan !== 'lifetime' && planDuration > 0) {
        const baseExpiry = isCurrentlyPremium ? settings.subscriptionExpiry : Date.now();
        finalExpiry = baseExpiry + planDuration;
      }

      let rewardGranted = false;

      // Check for referred rewards (12-month / Lifetime plan only!)
      if (
        (validation.plan === 'yearly' || validation.plan === 'lifetime') &&
        settings?.referredBy &&
        !settings?.referredByRewardGranted &&
        supabase
      ) {
        try {
          const { data, error: rpcErr } = await supabase.rpc('grant_referrer_reward', { p_referrer_code: settings.referredBy });
          if (rpcErr) {
            console.error('Failed to grant referrer reward via RPC:', rpcErr);
          } else {
            const result = data as any;
            if (result && result.success) {
              finalExpiry = finalExpiry + 30 * 24 * 60 * 60 * 1000; // 30 Days reward to referee on top of finalExpiry
              rewardGranted = true;
              logger.log('🎉 Referral reward of 30 days granted to referrer:', settings.referredBy);
            } else {
              console.warn('Referrer reward RPC returned failure:', result?.message);
            }
          }
        } catch (err) {
          console.error('Failed to grant referral reward to referrer:', err);
        }
      }

      // Update local Dexie DB settings
      await safeUpdateSettings({
        subscriptionStatus: 'premium',
        subscriptionPlan: validation.plan,
        subscriptionExpiry: finalExpiry,
        licenseKey: licenseKeyInput.trim(),
        activationDate: Date.now(),
        ...(rewardGranted ? { referredByRewardGranted: true } : {})
      });

      // Update cloud Supabase licenses table to mark this key as claimed
      if (supabase) {
        try {
          let userId = '';
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.id) {
            userId = session.user.id;
          } else {
            userId = localStorage.getItem('activeUserId') || '';
          }

          if (userId) {
            const { error: claimErr } = await supabase
              .from('licenses')
              .update({
                status: 'claimed',
                claimed_by_user_id: userId,
                claimed_at: new Date().toISOString()
              })
              .eq('license_key', licenseKeyInput.trim());

            if (claimErr) {
              console.error('Failed to claim license on cloud database:', claimErr);
            } else {
              logger.log('License key successfully marked as claimed in Supabase!');
            }
          } else {
            logger.warn('Cannot claim license: No authenticated user ID found!');
          }
        } catch (err) {
          console.error('Error claiming license in Supabase:', err);
        }
      }

      showToast(
        rewardGranted
          ? '🎉 Premium Activated! +30 Days Extra Referral Reward added to your account and your referrer!'
          : '🎉 Premium Subscription Activated Successfully!',
        'success'
      );

      setLicenseKeyInput('');
      if (onActivationSuccess) onActivationSuccess();
    } catch (error) {
      console.error('Activation Error:', error);
      showToast('Activation failed! Please check your key.', 'error');
    } finally {
      setIsActivating(false);
    }
  };

  const handleApplyReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = referralCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      showToast('Please enter a referral code!', 'error');
      return;
    }

    if (cleanCode === restaurantCode) {
      showToast('You cannot refer your own restaurant!', 'error');
      return;
    }

    if (settings?.referralClaimed) {
      showToast('You have already claimed a referral code!', 'error');
      return;
    }

    if (!supabase) {
      showToast('Cloud connection is offline. Please check your internet!', 'error');
      return;
    }

    setIsApplyingReferral(true);
    try {
      // Call SQL RPC check_referral_code to register the connection
      const { data, error } = await supabase.rpc('check_referral_code', { p_code: cleanCode });
      if (error) throw error;

      const result = data as any;

      if (result && result.success === false) {
        showToast(result.message || 'Invalid referral code!', 'error');
        setIsApplyingReferral(false);
        return;
      }

      // Save locally to update local state and trigger sync
      await safeUpdateSettings({
        referralClaimed: true,
        referredBy: cleanCode,
        referredByRewardGranted: false
      });

      showToast(result?.message || '🎉 Referral code applied successfully!', 'success');
      setLicenseKeyInput('');
      setReferralCodeInput('');
      if (onActivationSuccess) onActivationSuccess();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to process referral code!', 'error');
    } finally {
      setIsApplyingReferral(false);
    }
  };

  const fetchPendingRequest = async () => {
    if (!supabase) return;
    try {
      let userId = '';
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        userId = session.user.id;
      } else {
        userId = localStorage.getItem('activeUserId') || '';
      }

      if (!userId) return;

      const { data, error } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('app_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        const latest = data[0];
        if (latest.status === 'pending' || latest.status === 'rejected') {
          setPendingRequest(latest);
        } else {
          setPendingRequest(null);
        }
      } else {
        setPendingRequest(null);
      }
    } catch (err) {
      console.error('Failed to fetch pending payment requests:', err);
    }
  };

  useEffect(() => {
    if (!supabase) return;
    fetchPendingRequest();
    
    // Load Admin UPI Payment Settings
    const loadPaymentSettings = async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('data')
          .eq('app_user_id', 'global')
          .eq('id', 'payment_settings')
          .maybeSingle();

        if (!error && data && data.data) {
          const u1 = data.data.upi_id_1 || '8677994666@upi';
          const u2 = data.data.upi_id_2 || 'gudduk483@okaxis';
          setUpiId1(u1);
          setUpiId2(u2);
          setSelectedUpiId(u1);
        }
      } catch (err) {
        console.error('Failed to load payment settings from cloud:', err);
      }
    };
    loadPaymentSettings();

    // Subscribe to realtime database updates
    const channel = supabase.channel('my_payment_requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests' }, () => {
        fetchPendingRequest();
      })
      .subscribe();

    return () => {
      if (supabase) supabase.removeChannel(channel);
    };
  }, []);

  const handleSubmitPaymentRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!utrInput.trim()) {
      showToast('Please enter a valid 12-digit UPI UTR number!', 'error');
      return;
    }
    const cleanUtr = utrInput.trim().replace(/\s/g, '');
    if (!/^\d{12}$/.test(cleanUtr)) {
      showToast('UPI UTR number must be exactly 12 digits!', 'error');
      return;
    }

    setIsSubmittingPayment(true);
    try {
      if (!supabase) throw new Error('Database connection failed.');

      let userId = '';
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        userId = session.user.id;
      } else {
        userId = localStorage.getItem('activeUserId') || '';
      }
      if (!userId) throw new Error('Authentication required.');

      const planId = selectedPlanForPayment.id || (selectedPlanForPayment.name.toLowerCase().includes('month') ? 'monthly' : 'yearly');
      
      const { error } = await supabase.from('payment_requests').insert([
        {
          app_user_id: userId,
          restaurant_code: restaurantCode,
          restaurant_name: settings?.restaurantName || 'Unknown Restaurant',
          plan_id: planId,
          plan_name: selectedPlanForPayment.name,
          amount: selectedPlanForPayment.price,
          utr: cleanUtr,
          status: 'pending'
        }
      ]);

      if (error) {
        if (error.message.includes('unique constraint') || error.code === '23505') {
          throw new Error('This UTR has already been submitted for verification!');
        }
        throw error;
      }

      showToast('🎉 Payment verification request submitted successfully!', 'success');
      setSelectedPlanForPayment(null);
      setUtrInput('');
      setPaymentMethodChoice('options');
      fetchPendingRequest();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to submit payment request', 'error');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col gap-6 bg-[#FAFBFC] dark:bg-[#0B0F19] overflow-y-auto pb-16 md:pb-6 transition-colors">
      {/* Expiry Warning Header */}
      {isExpired ? (
        <div className="bg-gradient-to-r from-red-500 to-rose-600 rounded-3xl p-6 text-white shadow-lg shadow-red-200 dark:shadow-red-950/30 flex flex-col sm:flex-row items-center gap-4 shrink-0 animate-pulse">
          <div className="p-4 bg-white/20 rounded-full">
            <ShieldAlert size={36} />
          </div>
          <div className="text-center sm:text-left flex-1">
            <h2 className="text-xl font-black tracking-tight uppercase">Trial Period Expired!</h2>
            <p className="text-xs text-white/80 font-bold mt-1">
              Your 3-Day Free Trial has ended. Active billing features and configurations are currently locked. Enter an activation key below to continue.
            </p>
          </div>
        </div>
      ) : isTrial ? (
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 rounded-3xl p-6 text-white shadow-lg shadow-amber-200 dark:shadow-orange-950/30 flex flex-col sm:flex-row items-center gap-4 shrink-0">
          <div className="p-4 bg-white/20 rounded-full">
            <Gift size={36} className="animate-bounce" />
          </div>
          <div className="text-center sm:text-left flex-1">
            <h2 className="text-xl font-black tracking-tight uppercase">Free Trial Active</h2>
            <p className="text-xs text-white/80 font-bold mt-1">
              You are currently utilizing the 3-day full-access trial period. You have <strong>{daysLeft} days remaining</strong> before billing features lock.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-3xl p-6 text-white shadow-lg shadow-green-200 dark:shadow-emerald-950/30 flex flex-col sm:flex-row items-center gap-4 shrink-0">
          <div className="p-4 bg-white/20 rounded-full">
            <ShieldCheck size={36} />
          </div>
          <div className="text-center sm:text-left flex-1">
            <h2 className="text-xl font-black tracking-tight uppercase">Premium Membership Active!</h2>
            <p className="text-xs text-white/80 font-bold mt-1">
              {isLifetime ? (
                <>Thank you for supporting Siya Bill! You have a <strong>Lifetime Plan (Never Expires)</strong>.</>
              ) : (
                <>Thank you for supporting Siya Bill! Your active premium license expires on <strong>{expiryFormatted}</strong> ({daysLeft} {daysLeft === 1 ? 'day' : 'days'} left).</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Payment Request Status banner */}
      {pendingRequest && (
        <>
          {pendingRequest.status === 'pending' ? (
            <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-3xl p-6 text-amber-800 dark:text-amber-300 shadow-md flex flex-col sm:flex-row items-center gap-4 shrink-0">
              <div className="p-4 bg-amber-500/10 rounded-full shrink-0">
                <Clock className="text-amber-500 animate-pulse" size={32} />
              </div>
              <div className="text-center sm:text-left flex-1 min-w-0">
                <h2 className="text-base font-black tracking-tight uppercase">⏳ Payment Verification Pending</h2>
                <p className="text-xs font-semibold mt-1 opacity-90 leading-relaxed">
                  We are currently verifying your transaction with UTR <strong className="font-mono bg-amber-500/10 px-1.5 py-0.5 rounded text-amber-900 dark:text-amber-200">{pendingRequest.utr}</strong> for the <strong>{pendingRequest.plan_name}</strong>. Premium features will activate automatically once the admin matches it (usually 15-30 mins).
                </p>
                <p className="text-[10px] font-bold mt-1 opacity-75">
                  Requested at: {new Date(pendingRequest.created_at).toLocaleString()} | For support: +91 86779 94666
                </p>
              </div>
            </div>
          ) : pendingRequest.status === 'rejected' ? (
            <div className="bg-gradient-to-r from-red-500/20 to-rose-500/20 border border-red-500/30 rounded-3xl p-6 text-red-800 dark:text-rose-300 shadow-md flex flex-col sm:flex-row items-center gap-4 shrink-0">
              <div className="p-4 bg-red-500/10 rounded-full shrink-0">
                <ShieldAlert className="text-red-500" size={32} />
              </div>
              <div className="text-center sm:text-left flex-1 min-w-0">
                <h2 className="text-base font-black tracking-tight uppercase">❌ Payment Request Rejected</h2>
                <p className="text-xs font-semibold mt-1 opacity-90 leading-relaxed">
                  Your verification request for UTR <strong className="font-mono bg-red-500/10 px-1.5 py-0.5 rounded text-red-900 dark:text-red-200">{pendingRequest.utr}</strong> was rejected.
                </p>
                {pendingRequest.admin_notes && (
                  <p className="text-xs font-black mt-1 text-red-900 dark:text-red-100 bg-red-500/10 px-3 py-2 rounded-xl border border-red-500/20">
                    Reason: {pendingRequest.admin_notes}
                  </p>
                )}
                <div className="flex justify-center sm:justify-start gap-3 mt-3">
                  <button
                    onClick={async () => {
                      if (supabase) {
                        try {
                          const { error } = await supabase
                            .from('payment_requests')
                            .delete()
                            .eq('id', pendingRequest.id);
                          if (error) throw error;
                          showToast('Rejected request dismissed. You can submit a new payment request.', 'success');
                        } catch (err: any) {
                          console.error('[Dismiss Payment] Error:', err);
                          showToast(err.message || 'Failed to dismiss payment request. Please check connection.', 'error');
                          return;
                        }
                      }
                      setPendingRequest(null);
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-md shadow-red-600/10"
                  >
                    Dismiss & Try Again
                  </button>
                  <a
                    href="https://wa.me/918677994666?text=Hi%20Guddu,%20my%20payment%20request%20with%20UTR%20was%20rejected"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 border border-slate-700"
                  >
                    Contact Support
                  </a>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Pricing Matrix */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Pricing cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {dynamicPlans.length > 0 ? (
              dynamicPlans.map((plan, idx) => {
                const isFeatured = plan.id === 'yearly' || idx === dynamicPlans.length - 1;
                return (
                  <div 
                    key={plan.id}
                    className={`rounded-3xl p-6 border shadow-sm flex flex-col gap-4 relative overflow-hidden group hover:scale-[1.02] transition-all hover-lift ${
                      isFeatured 
                        ? 'bg-gradient-to-br from-indigo-950 to-gray-900 border-indigo-950 text-white glow-indigo' 
                        : 'bg-white dark:bg-slate-900/60 border-gray-100 dark:border-slate-800/80 text-gray-800 dark:text-slate-200'
                    }`}
                  >
                    {isFeatured && (
                      <div className="absolute top-3 right-3 bg-gradient-to-r from-orange-500 to-pink-500 px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider animate-pulse shadow-md text-white">
                        Best Value
                      </div>
                    )}
                    <div className={`p-2.5 rounded-xl w-fit font-black text-xs uppercase tracking-wider transition-colors ${
                      isFeatured ? 'bg-white/10 text-orange-400' : 'bg-indigo-50 text-indigo-600'
                    }`}>
                      {plan.name}
                    </div>
                    <div>
                      <span className={`text-3xl font-black ${isFeatured ? 'text-white' : 'text-gray-800 dark:text-slate-100'}`}>₹{plan.price}</span>
                      <span className={`text-xs font-bold ${isFeatured ? 'text-gray-300' : 'text-gray-500 dark:text-slate-400'}`}>
                        {plan.duration_days >= 9999 ? ' / Lifetime' : ` / ${plan.duration_days} Days`}
                      </span>
                    </div>
                    <p className={`text-xs font-semibold leading-relaxed ${isFeatured ? 'text-gray-400' : 'text-gray-400 dark:text-slate-500'}`}>
                      {plan.duration_days >= 9999 
                        ? 'Complete lifetime access to all core and premium features.' 
                        : `Complete full premium access for ${plan.duration_days} days.`}
                    </p>
                    <div className={`border-t pt-4 flex flex-col gap-2.5 mt-auto ${isFeatured ? 'border-white/10' : 'border-gray-50 dark:border-slate-800/50'}`}>
                      {(Array.isArray(plan.features) ? plan.features : []).map((feat: string, fIdx: number) => (
                        <div key={fIdx} className={`flex items-center gap-2 text-xs font-bold ${isFeatured ? 'text-gray-200' : 'text-gray-600 dark:text-slate-400'}`}>
                          {isFeatured ? (
                            <Zap size={14} className="text-yellow-400 shrink-0" />
                          ) : (
                            <CheckCircle2 size={14} className="text-indigo-500 shrink-0" />
                          )}
                          {feat}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedPlanForPayment(plan);
                        setPaymentMethodChoice('options');
                      }}
                      className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider text-center transition-all duration-200 mt-3 active:scale-95 flex items-center justify-center gap-1.5 ${
                        isFeatured
                          ? 'bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white shadow-md shadow-orange-500/20'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/10'
                      }`}
                    >
                      <Zap size={12} className={isFeatured ? 'text-yellow-300' : ''} />
                      Buy Premium Plan
                    </button>
                  </div>
                );
              })
            ) : (
              <>
                {/* Monthly Card */}
                <div className="bg-white dark:bg-slate-900/60 rounded-3xl p-6 border border-gray-100 dark:border-slate-800/80 shadow-sm flex flex-col gap-4 relative overflow-hidden group hover:scale-[1.02] transition-all hover-lift">
                  <div className="p-2.5 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-xl w-fit font-black text-xs uppercase tracking-wider transition-colors">
                    Monthly
                  </div>
                  <div>
                    <span className="text-3xl font-black text-gray-800 dark:text-slate-100">₹{plans.monthly?.price ?? 999}</span>
                    <span className="text-xs font-bold text-gray-500 dark:text-slate-400"> / Month</span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-slate-500 font-semibold leading-relaxed">
                    Best for small cafes or new outlets starting their journey.
                  </p>
                  <div className="border-t border-gray-50 dark:border-slate-800/50 pt-4 flex flex-col gap-2.5 mt-auto">
                    {(plans.monthly?.features || []).map((feat: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-slate-400">
                        <CheckCircle2 size={14} className="text-blue-500 shrink-0" />
                        {feat}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedPlanForPayment({
                        id: 'monthly',
                        name: 'Monthly Plan',
                        price: plans.monthly?.price ?? 999,
                        duration_days: 30
                      });
                      setPaymentMethodChoice('options');
                    }}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-wider text-center transition-all duration-200 mt-3 active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/10"
                  >
                    <Zap size={12} />
                    Buy Monthly Plan
                  </button>
                </div>

                {/* 6-Month Card */}
                <div className="bg-white dark:bg-slate-900/60 rounded-3xl p-6 border border-gray-100 dark:border-slate-800/80 shadow-sm flex flex-col gap-4 relative overflow-hidden group hover:scale-[1.02] transition-all hover-lift">
                  <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-xl w-fit font-black text-xs uppercase tracking-wider transition-colors">
                    6 Months
                  </div>
                  <div>
                    <span className="text-3xl font-black text-gray-800 dark:text-slate-100">₹{plans.halfYearly?.price ?? 4999}</span>
                    <span className="text-xs font-bold text-gray-500 dark:text-slate-400"> / Plan</span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-slate-500 font-semibold leading-relaxed">
                    Save ~16% compared to monthly. Ideal for active local bistros.
                  </p>
                  <div className="border-t border-gray-50 dark:border-slate-800/50 pt-4 flex flex-col gap-2.5 mt-auto">
                    {(plans.halfYearly?.features || []).map((feat: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-slate-400">
                        <CheckCircle2 size={14} className="text-indigo-500 shrink-0" />
                        {feat}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedPlanForPayment({
                        id: 'half-yearly',
                        name: '6 Months Plan',
                        price: plans.halfYearly?.price ?? 4999,
                        duration_days: 180
                      });
                      setPaymentMethodChoice('options');
                    }}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-wider text-center transition-all duration-200 mt-3 active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/10"
                  >
                    <Zap size={12} />
                    Buy 6-Month Plan
                  </button>
                </div>

                {/* 12-Month Card (Best Value) */}
                <div className="bg-gradient-to-br from-indigo-950 to-gray-900 rounded-3xl p-6 border border-indigo-950 shadow-md flex flex-col gap-4 relative overflow-hidden group hover:scale-[1.02] transition-all text-white glow-indigo hover-lift">
                  <div className="absolute top-3 right-3 bg-gradient-to-r from-orange-500 to-pink-500 px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider animate-pulse shadow-md">
                    Best Value
                  </div>
                  <div className="p-2.5 bg-white/10 text-orange-400 rounded-xl w-fit font-black text-xs uppercase tracking-wider">
                    Yearly Plan
                  </div>
                  <div>
                    <span className="text-3xl font-black">₹{plans.yearly?.price ?? 7999}</span>
                    <span className="text-xs font-bold text-gray-300"> / Year</span>
                  </div>
                  <p className="text-xs text-gray-400 font-semibold leading-relaxed">
                    Save ~55%! Full long-term premium support and lifetime stability.
                  </p>
                  <div className="border-t border-white/10 pt-4 flex flex-col gap-2.5 mt-auto">
                    {(plans.yearly?.features || []).map((feat: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 text-xs font-bold text-gray-200">
                        <Zap size={14} className="text-yellow-400 shrink-0" />
                        {feat}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedPlanForPayment({
                        id: 'yearly',
                        name: 'Yearly Plan',
                        price: plans.yearly?.price ?? 7999,
                        duration_days: 365
                      });
                      setPaymentMethodChoice('options');
                    }}
                    className="w-full py-3 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white rounded-xl font-black text-xs uppercase tracking-wider text-center transition-all duration-200 mt-3 active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/20"
                  >
                    <Zap size={12} className="text-yellow-300 animate-pulse" />
                    Buy Yearly Plan
                  </button>
                </div>
              </>
            )}
          </div>

          {/* FAQ Block */}
          <div className="glass-card-solid rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col gap-4 transition-colors">
            <h3 className="font-black text-gray-800 dark:text-slate-100 text-base flex items-center gap-2 transition-colors">
              <HelpCircle className="text-indigo-500" size={20} />
              Frequently Asked Questions (FAQ)
            </h3>
            <div className="flex flex-col gap-3 text-xs font-medium text-gray-500 dark:text-slate-400 leading-relaxed transition-colors">
              <div>
                <h4 className="font-bold text-gray-700 dark:text-slate-300 transition-colors">Q: How do I purchase a license key?</h4>
                <p className="mt-1">
                  Copy your unique <strong>Restaurant Code</strong> on the right sidebar and send it to our official distributor via WhatsApp (+91 86779 94666). Make the payment and they will instantly generate your license activation key.
                </p>
              </div>
              <div className="mt-2 border-t border-gray-50 dark:border-slate-800/50 pt-3">
                <h4 className="font-bold text-gray-700 dark:text-slate-300 transition-colors">Q: Is an active internet connection required?</h4>
                <p className="mt-1">
                  Yes, absolutely! Siya Bill is a cloud-powered system. An active internet connection is strictly required at all times to perform billing, update records, and keep your data safely synced. The software will not work in offline mode.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Right 1 Column: Activation form */}
        <div className="flex flex-col gap-6">
          
          {/* Restaurant code Card */}
          <div className="glass-card-solid rounded-3xl p-6 shadow-sm flex flex-col gap-4 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 rounded-xl transition-colors">
                <KeyRound size={20} />
              </div>
              <div>
                <h4 className="font-black text-sm text-gray-800 dark:text-slate-200 transition-colors">Restaurant Code</h4>
                <p className="text-xs text-gray-400 dark:text-slate-500 font-semibold">Send this code to generate key.</p>
              </div>
            </div>
            
            <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-900/40 border border-gray-100 dark:border-slate-800/60 p-3 rounded-2xl transition-colors">
              <span className="font-black text-gray-800 dark:text-slate-200 text-sm tracking-widest transition-colors">{restaurantCode || 'Loading...'}</span>
              <button 
                onClick={copyToClipboard}
                className="p-2 bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl border border-gray-200/50 dark:border-slate-700 shadow-sm dark:shadow-none transition-colors text-gray-600 dark:text-slate-400 active:scale-95"
                title="Copy Restaurant Code"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>

          {/* Activation Key Form */}
          <div className="glass-card-solid rounded-3xl p-6 shadow-sm flex flex-col gap-4 transition-colors">
            <h4 className="font-black text-sm text-gray-800 dark:text-slate-200 transition-colors">Activate License</h4>
            <label htmlFor="licenseKeyInput" className="text-xs text-gray-400 dark:text-slate-500 font-semibold leading-relaxed cursor-pointer">
              Paste the activation key received from your distributor below:
            </label>

            <form onSubmit={handleActivate} className="flex flex-col gap-3">
              <input 
                id="licenseKeyInput"
                name="licenseKeyInput"
                type="text"
                value={licenseKeyInput}
                onChange={(e) => setLicenseKeyInput(e.target.value)}
                placeholder="RESPOS-M01-XXXXXXXX-XXXX"
                className="w-full p-3 rounded-2xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-500 font-black text-sm text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 tracking-wider text-center uppercase placeholder-gray-400/70 dark:placeholder-slate-500/70 transition-colors"
              />
              <button
                type="submit"
                disabled={isActivating}
                className="w-full py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-md shadow-orange-100 dark:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
              >
                <ShieldCheck size={16} />
                {isActivating ? 'Verifying...' : 'Activate Premium'}
              </button>
            </form>
          </div>

          {/* Refer & Earn Card */}
          <div className="glass-card-solid rounded-3xl p-6 shadow-sm flex flex-col gap-4 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-xl transition-colors">
                <Gift size={20} className="animate-pulse text-amber-500" />
              </div>
              <div>
                <h4 className="font-black text-sm text-gray-800 dark:text-slate-200 transition-colors">🎁 Refer & Earn 30 Days</h4>
                <p className="text-xs text-gray-400 dark:text-slate-500 font-semibold leading-relaxed">
                  Refer Siya Bill to a friend and both get 30 days premium!
                </p>
              </div>
            </div>

            {settings?.referralClaimed ? (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl flex flex-col gap-1 items-center text-center transition-colors">
                <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Referral Reward Active!</span>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                  You successfully claimed a referral code from {settings.referredBy}! Enjoy your 30 Days Free extension!
                </p>
              </div>
            ) : (
              <form onSubmit={handleApplyReferral} className="flex flex-col gap-3 border-t border-gray-50 dark:border-slate-800/50 pt-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="referralCodeInput" className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest cursor-pointer">Enter Friend's Code</label>
                  <input 
                    id="referralCodeInput"
                    name="referralCodeInput"
                    type="text"
                    value={referralCodeInput}
                    onChange={(e) => setReferralCodeInput(e.target.value)}
                    placeholder="e.g. RES-G6T8X9"
                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-amber-500 font-black text-xs text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 tracking-wider text-center uppercase placeholder-gray-400/70 dark:placeholder-slate-500/70 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isApplyingReferral}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-amber-100 dark:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
                >
                  <Gift size={14} />
                  {isApplyingReferral ? 'Applying...' : 'Apply Gift Code'}
                </button>
              </form>
            )}
          </div>

          {/* Quick Support Call */}
          <a
            href="https://wa.me/918677994666?text=Hi%20Guddu,%20I%20want%20to%20purchase%20POS%20license"
            target="_blank"
            rel="noopener noreferrer"
            className="p-5 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/40 hover:border-green-300 dark:hover:border-green-700 hover:bg-green-100/30 dark:hover:bg-green-950/30 rounded-3xl transition-all flex items-center gap-4"
          >
            <div className="p-3 bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 rounded-2xl shadow-sm dark:shadow-none shrink-0 transition-colors">
              <PhoneCall size={20} />
            </div>
            <div>
              <h5 className="font-black text-xs text-gray-800 dark:text-slate-200 transition-colors">Contact Developer Support</h5>
              <p className="text-xs text-green-700 dark:text-green-400 font-bold mt-0.5">Instant WhatsApp License Delivery</p>
            </div>
          </a>

        </div>
      </div>

      {/* Payment request modal */}
      {selectedPlanForPayment && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-6 flex flex-col gap-6 shadow-2xl animate-in zoom-in-95 duration-200 relative">
            <button
              onClick={() => setSelectedPlanForPayment(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
              title="Close modal"
            >
              <X size={16} />
            </button>

            <div className="text-center pb-2 border-b border-slate-100 dark:border-slate-800/80">
              <h3 className="font-black text-lg text-slate-800 dark:text-slate-100">Activate Premium</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-bold">
                Selected: <span className="text-indigo-600 dark:text-indigo-400">{selectedPlanForPayment.name}</span> (₹{selectedPlanForPayment.price})
              </p>
            </div>

            {paymentMethodChoice === 'options' ? (
              <div className="flex flex-col gap-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center font-semibold">
                  Choose your preferred activation method:
                </p>
                <button
                  onClick={() => setPaymentMethodChoice('qr')}
                  className="p-4 bg-indigo-50 hover:bg-indigo-100/80 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl flex items-center gap-4 transition-all text-left group active:scale-[0.98] w-full"
                >
                  <div className="p-3 bg-indigo-600 text-white rounded-xl">
                    <CreditCard size={20} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-black text-xs text-slate-800 dark:text-slate-200">Instant UPI Payment (Recommended)</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mt-0.5">Pay via QR, enter UTR and activate automatically.</p>
                  </div>
                </button>

                <a
                  href={`https://wa.me/918677994666?text=Hi%20Guddu,%20I%20want%20to%20buy%20the%20${encodeURIComponent(selectedPlanForPayment.name)}%20Premium%20Plan%20for%20my%20restaurant%20(Restaurant%20Code:%20${encodeURIComponent(restaurantCode)})`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 bg-green-50 hover:bg-green-100/80 dark:bg-green-950/20 dark:hover:bg-green-950/40 border border-green-100 dark:border-green-900/40 rounded-2xl flex items-center gap-4 transition-all text-left active:scale-[0.98] w-full"
                >
                  <div className="p-3 bg-green-600 text-white rounded-xl">
                    <PhoneCall size={20} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-black text-xs text-slate-800 dark:text-slate-200">WhatsApp Support (Manual Key)</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mt-0.5">Contact developer support directly to pay and get license key.</p>
                  </div>
                </a>
              </div>
            ) : (
              <form onSubmit={handleSubmitPaymentRequest} className="flex flex-col gap-4">
                <div className="flex flex-col items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-850">
                  <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Step 1: Scan & Pay ₹{selectedPlanForPayment.price}</span>
                  
                  {/* Account Selector if both UPI IDs exist and are not empty */}
                  {upiId1 && upiId2 && upiId1.trim() !== '' && upiId2.trim() !== '' && upiId1 !== upiId2 && (
                    <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl w-full max-w-[280px] mb-2 border border-slate-200/50 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setSelectedUpiId(upiId1)}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                          selectedUpiId === upiId1
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350 text-gray-500'
                        }`}
                      >
                        Account 1
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedUpiId(upiId2)}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                          selectedUpiId === upiId2
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350 text-gray-500'
                        }`}
                      >
                        Account 2
                      </button>
                    </div>
                  )}

                  <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-center">
                    <QRCodeSVG
                      value={`upi://pay?pa=${selectedUpiId}&pn=Siya%20Bill&am=${selectedPlanForPayment.price}&tn=${encodeURIComponent(`SiyaBill ${selectedPlanForPayment.name} - ${restaurantCode}`)}&cu=INR`}
                      size={180}
                      level="M"
                    />
                  </div>

                  <div className="text-center">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">UPI ID:</span>
                    <div className="flex items-center justify-center gap-1.5 mt-0.5">
                      <code className="text-xs font-mono font-black text-slate-700 dark:text-slate-300">{selectedUpiId}</code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedUpiId);
                          showToast('📋 UPI ID copied!', 'success');
                        }}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded"
                        title="Copy UPI ID"
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="utrInput" className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Step 2: Enter 12-Digit Transaction UTR
                  </label>
                  <input
                    id="utrInput"
                    type="text"
                    required
                    maxLength={12}
                    value={utrInput}
                    onChange={(e) => setUtrInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 123456789012"
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:border-indigo-500 text-center font-mono font-black text-sm tracking-widest placeholder-slate-400/80 dark:placeholder-slate-500/80 text-gray-800 dark:text-slate-200"
                  />
                </div>

                <div className="flex gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setPaymentMethodChoice('options')}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 border border-slate-200/50 dark:border-slate-700"
                  >
                    Go Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingPayment}
                    className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-indigo-600/10 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"
                  >
                    {isSubmittingPayment ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={12} />
                        Submit UTR
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
