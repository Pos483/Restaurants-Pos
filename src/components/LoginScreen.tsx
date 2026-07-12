import { useState, useEffect } from 'react';
import { Utensils, Mail, Lock, Store, ArrowRight, Loader2, Phone, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../supabase';
import { User } from '@supabase/supabase-js';
import { useToast } from './Toast';

const BLOCKED_EMAIL_DOMAINS = [
  'mailinator.com', 'tempmail.com', 'guerrillamail.com', '10minutemail.com',
  'throwam.com', 'yopmail.com', 'dispostable.com', 'trashmail.com',
  'fakeinbox.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'guerrillamail.info', 'spam4.me', 'mintemail.com', 'mailnull.com',
  'spamgourmet.com', 'mailnesia.com', 'maildrop.cc'
];

const getDeviceFingerprint = (): string => {
  const parts = [
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.platform,
    navigator.hardwareConcurrency || 0
  ];
  return parts.join('|');
};

interface Props {
  onLoginSuccess: (user: User) => void;
}

export default function LoginScreen({ onLoginSuccess }: Props) {
  const { showToast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showVerifyEmail, setShowVerifyEmail] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  // Fix 1: Brute-force login protection
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [loginLockedUntil, setLoginLockedUntil] = useState<number | null>(null);
  const [lockCountdown, setLockCountdown] = useState(0);
  // Fix 2: Signup spam protection
  const [signupBlocked, setSignupBlocked] = useState(false);
  const [signupBlockedUntil, setSignupBlockedUntil] = useState<number | null>(null);
  const [signupCountdown, setSignupCountdown] = useState(0);
  // Fix 3: Password visibility
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
    // Clean up any previously stored passwords (security fix)
    localStorage.removeItem('rememberedPassword');
  }, []);

  useEffect(() => {
    const pendingEmail = localStorage.getItem('pendingVerificationEmail');
    if (pendingEmail) {
      setVerifyEmail(pendingEmail);
      setShowVerifyEmail(true);
    }

    // Check for hash errors in URL redirect from confirmation/reset failure
    const hash = window.location.hash;
    if (hash && hash.includes('error=')) {
      const params = new URLSearchParams(hash.substring(1));
      const errorMsg = params.get('error_description') || params.get('error') || 'Authentication failed.';
      setError(decodeURIComponent(errorMsg).replace(/\+/g, ' '));
      // Clear hash to prevent duplicate alerts and state pollution
      window.history.replaceState(null, '', window.location.origin);
    }
  }, []);

  const checkVerificationStatus = async (showFeedback = false) => {
    if (!supabase || !verifyEmail || !tempPassword) return;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: verifyEmail,
        password: tempPassword,
      });
      
      if (error) {
        if (showFeedback) {
          showToast('Email is not yet verified. Please check your inbox.', 'error');
        }
        return;
      }
      
      if (data.user) {
        showToast('Email verified successfully! Welcome to Siya Bill.', 'success');
        setShowVerifyEmail(false);
        setTempPassword('');
        localStorage.removeItem('pendingVerificationEmail');
        handleSuccessfulLogin(data.user);
      }
    } catch (_) {
      // ignore
    }
  };

  useEffect(() => {
    if (!showVerifyEmail || !tempPassword) return;
    const interval = setInterval(() => {
      checkVerificationStatus(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [showVerifyEmail, tempPassword, verifyEmail]);

  // Load lockout state from localStorage on email change
  useEffect(() => {
    const stored = localStorage.getItem(`loginAttempts_${email}`);
    if (stored) {
      const { attempts, lockedUntil } = JSON.parse(stored);
      setLoginAttempts(attempts || 0);
      if (lockedUntil && lockedUntil > Date.now()) {
        setLoginLockedUntil(lockedUntil);
      } else {
        setLoginLockedUntil(null);
      }
    }
  }, [email]);

  // Login lockout countdown timer
  useEffect(() => {
    if (!loginLockedUntil) { setLockCountdown(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((loginLockedUntil - Date.now()) / 1000));
      setLockCountdown(remaining);
      if (remaining === 0) setLoginLockedUntil(null);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [loginLockedUntil]);

  // Load signup block state from localStorage on mount
  useEffect(() => {
    const fp = getDeviceFingerprint();
    const stored = localStorage.getItem(`signupLog_${fp}`);
    if (stored) {
      const { signups, blockedUntil } = JSON.parse(stored);
      if (blockedUntil && blockedUntil > Date.now()) {
        setSignupBlocked(true);
        setSignupBlockedUntil(blockedUntil);
      } else {
        // Clean expired entries
        const fresh = (signups || []).filter((t: number) => t > Date.now() - 86400000);
        if (fresh.length >= 3) {
          const newBlockedUntil = Math.min(...fresh) + 86400000;
          setSignupBlocked(true);
          setSignupBlockedUntil(newBlockedUntil);
        }
      }
    }
  }, []);

  // Signup block countdown timer
  useEffect(() => {
    if (!signupBlockedUntil) { setSignupCountdown(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((signupBlockedUntil - Date.now()) / 1000));
      setSignupCountdown(remaining);
      if (remaining === 0) { setSignupBlocked(false); setSignupBlockedUntil(null); }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [signupBlockedUntil]);


  // Brute-force helpers
  const getLoginDelay = (attempts: number): number => {
    if (attempts <= 2) return 0;
    if (attempts === 3) return 5000;
    if (attempts === 4) return 30000;
    if (attempts === 5) return 120000;
    return 900000; // 15 minutes
  };

  const recordFailedAttempt = (currentAttempts: number) => {
    const newAttempts = currentAttempts + 1;
    const delay = getLoginDelay(newAttempts);
    const lockedUntil = delay > 0 ? Date.now() + delay : null;
    setLoginAttempts(newAttempts);
    setLoginLockedUntil(lockedUntil);
    localStorage.setItem(`loginAttempts_${email}`, JSON.stringify({
      attempts: newAttempts,
      lockedUntil
    }));
  };

  const clearLoginAttempts = () => {
    setLoginAttempts(0);
    setLoginLockedUntil(null);
    localStorage.removeItem(`loginAttempts_${email}`);
  };

  // Signup spam helper
  const recordSignupAttempt = () => {
    const fp = getDeviceFingerprint();
    const stored = localStorage.getItem(`signupLog_${fp}`);
    const existing = stored ? JSON.parse(stored) : { signups: [] };
    const fresh = (existing.signups || []).filter((t: number) => t > Date.now() - 86400000);
    fresh.push(Date.now());
    let newBlockedUntil: number | null = null;
    if (fresh.length >= 3) {
      newBlockedUntil = Math.min(...fresh) + 86400000;
      setSignupBlocked(true);
      setSignupBlockedUntil(newBlockedUntil);
    }
    localStorage.setItem(`signupLog_${fp}`, JSON.stringify({ signups: fresh, blockedUntil: newBlockedUntil }));
  };

  const handleSuccessfulLogin = (user: User) => {
    clearLoginAttempts();
    if (rememberMe) {
      localStorage.setItem('rememberedEmail', email);
    } else {
      localStorage.removeItem('rememberedEmail');
    }
    onLoginSuccess(user);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!navigator.onLine) {
      setError('An active internet connection is required to reset password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (!supabase) throw new Error('Database is not connected!');
      const rawSiteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
      const siteUrl = rawSiteUrl.endsWith('/') ? rawSiteUrl : `${rawSiteUrl}/`;
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: siteUrl,
      });
      if (error) throw error;
      showToast('Password reset link sent! Please check your email.', 'success');
      setShowForgotPassword(false);
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if account is locked
    if (loginLockedUntil && loginLockedUntil > Date.now()) {
      setError(`Too many failed attempts. Please wait ${lockCountdown} seconds before trying again.`);
      return;
    }

    // Check signup spam limit
    if (!isLogin) {
      // Block disposable email domains
      const emailDomain = email.split('@')[1]?.toLowerCase() || '';
      if (BLOCKED_EMAIL_DOMAINS.includes(emailDomain)) {
        setError('Disposable email addresses are not allowed. Please use your real email address.');
        return;
      }
      // Block if device has created too many accounts recently
      if (signupBlocked) {
        const hours = Math.ceil(signupCountdown / 3600);
        setError(`Maximum accounts for today have been created from this device. Please try again after ${hours > 1 ? hours + ' hours' : signupCountdown + ' seconds'}.`);
        return;
      }
    }

    if (!navigator.onLine) {
      setError('An active internet connection is required to login or register.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      if (!supabase) {
        throw new Error('Database is not connected! Please contact administrator.');
      }

      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data.user) {
            handleSuccessfulLogin(data.user);
        }
      } else {
        if (!phone.trim()) {
          throw new Error('Mobile number is strictly required for registration!');
        }
        const rawSiteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
        const siteUrl = rawSiteUrl.endsWith('/') ? rawSiteUrl : `${rawSiteUrl}/`;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: siteUrl,
            data: {
              restaurant_name: restaurantName,
              phone: phone.trim(),
            }
          }
        });
        if (error) throw error;
        if (data?.session && data.user) {
          recordSignupAttempt();
          showToast('Account created and signed in successfully!', 'success');
          handleSuccessfulLogin(data.user);
        } else {
          recordSignupAttempt();
          showToast('Account created successfully! Please check your email to verify.', 'success');
          // Show verification pending screen if email not yet confirmed
          if (data?.user && !data.user.email_confirmed_at) {
            setVerifyEmail(email);
            setTempPassword(password);
            setShowVerifyEmail(true);
            localStorage.setItem('pendingVerificationEmail', email);
          } else {
            setIsLogin(true);
          }
        }
      }
    } catch (err: any) {
      if (isLogin) {
        recordFailedAttempt(loginAttempts);
      }
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  /* Shared input class for consistent premium styling */
  const inputClass = `w-full pl-12 pr-4 py-3.5 rounded-xl font-medium transition-all duration-200
    bg-white/80 dark:bg-white/5 border border-gray-200 dark:border-white/10
    text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
    focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 dark:focus:border-orange-400
    backdrop-blur-sm shadow-sm dark:shadow-none`;

  const labelClass = 'text-sm font-bold text-gray-700 dark:text-gray-300 transition-colors';

  const iconWrapperClass = 'absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 dark:text-gray-500';

  return (
    <div className="relative flex items-center justify-center min-h-screen w-full overflow-y-auto font-sans transition-colors duration-300 bg-[#FAFBFC] dark:bg-[#0B0F19]">

      {/* ── Animated Gradient Background ── */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Base gradient layer */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-indigo-500/10 dark:from-orange-500/5 dark:via-transparent dark:to-indigo-500/5" />

        {/* Animated floating orbs */}
        <div className="absolute top-[-20%] left-[-10%] w-[40rem] h-[40rem] rounded-full bg-orange-400/20 dark:bg-orange-500/10 blur-3xl animate-pulse [animation-duration:8s]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[35rem] h-[35rem] rounded-full bg-indigo-400/20 dark:bg-indigo-500/10 blur-3xl animate-pulse [animation-duration:10s]" />
        <div className="absolute top-[40%] left-[60%] w-[25rem] h-[25rem] rounded-full bg-orange-300/10 dark:bg-orange-600/5 blur-3xl animate-pulse [animation-duration:12s]" />

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[radial-gradient(circle,_#000000_1px,_transparent_1px)] dark:bg-[radial-gradient(circle,_#ffffff_1px,_transparent_1px)] bg-[size:32px_32px]"
        />
      </div>

      {/* ── Centered Glass Card ── */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-2xl rounded-3xl border border-white/50 dark:border-white/10 shadow-2xl shadow-black/5 dark:shadow-black/30 p-5 sm:p-10 transition-all duration-300">

          {/* ── Brand Header ── */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-indigo-500 rounded-2xl blur-lg opacity-40" />
              <div className="relative bg-gradient-to-br from-orange-500 to-orange-600 w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/25">
                <Utensils size={30} className="text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white transition-colors">
              SIYA BILL
            </h1>
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-gray-400 dark:text-gray-500 mt-1 transition-colors">
              Restaurant POS
            </p>
          </div>

          {/* ── Verification Pending Screen OR Normal Form ── */}
          {showVerifyEmail ? (
            <div className="flex flex-col items-center gap-5 py-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-orange-500/20 dark:bg-orange-500/10 animate-ping" />
                <div className="relative w-20 h-20 rounded-full bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center border border-orange-500/20 shadow-inner">
                  <Mail size={36} className="text-orange-500 animate-bounce" />
                </div>
              </div>

              <div className="text-center">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Email Verify Karein</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  Aapke email <span className="font-bold text-gray-700 dark:text-gray-200 break-all">{verifyEmail}</span> par verification link bheja gaya hai.
                </p>
                <p className="text-xs text-orange-500 dark:text-orange-400 font-bold mt-2 flex items-center justify-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Auto-checking status in background...
                </p>
              </div>

              {tempPassword && (
                <button
                  type="button"
                  onClick={() => checkVerificationStatus(true)}
                  className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-4 rounded-xl transition-all duration-200 shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  I Have Verified My Email <ArrowRight size={18} />
                </button>
              )}

              <div className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 text-xs text-gray-500 dark:text-gray-400 flex flex-col gap-2">
                <p className="font-bold text-gray-700 dark:text-gray-300">💡 Next Steps:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Check your mailbox on your phone/computer.</li>
                  <li>Click the verification link in the email from Supabase.</li>
                  <li>Once verified, this screen will auto-login!</li>
                </ul>
              </div>

              <div className="flex flex-col items-center gap-3 w-full mt-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!supabase) return;
                    try {
                      await supabase.auth.resend({ type: 'signup', email: verifyEmail });
                      showToast('Verification email resent successfully!', 'success');
                    } catch { showToast('Resend failed. Please try again later.', 'error'); }
                  }}
                  className="text-sm font-bold text-orange-500 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                >
                  Didn't receive the email? Resend
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowVerifyEmail(false);
                    setTempPassword('');
                    localStorage.removeItem('pendingVerificationEmail');
                    setIsLogin(true);
                  }}
                  className="text-xs font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors mt-2"
                >
                  ← Back to Login Screen
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ── Section Title ── */}
              <div className="mb-6 text-center">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 tracking-tight transition-colors">
                  {showForgotPassword ? 'Reset Password' : (isLogin ? 'Welcome Back' : 'Create Account')}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-1.5 transition-colors">
                  {showForgotPassword
                    ? 'Enter your email to receive a password reset link.'
                    : (isLogin
                      ? 'Enter your credentials to access your dashboard.'
                      : 'Sign up to get started with your new restaurant POS.')}
                </p>
              </div>

              {/* ── Lockout Banner ── */}
              {loginLockedUntil && lockCountdown > 0 && (
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-500/20 text-orange-700 dark:text-orange-400 px-4 py-3 rounded-xl mb-5 text-sm font-bold flex flex-col gap-1 transition-colors animate-[fadeIn_0.2s_ease-out]">
                  <span>🔒 Account temporarily locked</span>
                  <span className="font-mono text-base">{Math.floor(lockCountdown / 60)}:{String(lockCountdown % 60).padStart(2, '0')} until unlock</span>
                </div>
              )}

              {/* ── Error Banner ── */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl mb-5 text-sm font-bold flex items-center gap-2 transition-colors animate-[fadeIn_0.2s_ease-out]">
                  <span className="flex-1">{error}</span>
                </div>
              )}

              {/* ── Forgot Password Form ── */}
              {showForgotPassword ? (
                <form onSubmit={handleForgotPassword} className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <label className={labelClass}>Email Address</label>
                    <div className="relative">
                      <div className={iconWrapperClass}>
                        <Mail size={18} />
                      </div>
                      <input
                        type="email"
                        required
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className={inputClass}
                        placeholder="owner@restaurant.com"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-4 rounded-xl mt-2 transition-all duration-200 shadow-lg shadow-orange-500/20 dark:shadow-orange-500/10 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-xl hover:shadow-orange-500/25 active:scale-[0.98]"
                  >
                    {loading ? <Loader2 size={20} className="animate-spin" /> : 'Send Reset Link'}
                    {!loading && <ArrowRight size={18} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(false)}
                    className="text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 mt-1 transition-colors"
                  >
                    ← Back to Sign In
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  {!isLogin && (
                    <>
                      {/* Restaurant Name */}
                      <div className="flex flex-col gap-2">
                        <label className={labelClass}>Restaurant Name</label>
                        <div className="relative">
                          <div className={iconWrapperClass}>
                            <Store size={18} />
                          </div>
                          <input
                            type="text"
                            required
                            value={restaurantName}
                            onChange={(e) => setRestaurantName(e.target.value)}
                            className={inputClass}
                            placeholder="Your Restaurant Name"
                          />
                        </div>
                      </div>

                      {/* Mobile Number */}
                      <div className="flex flex-col gap-2">
                        <label className={labelClass}>Mobile Number</label>
                        <div className="relative">
                          <div className={iconWrapperClass}>
                            <Phone size={18} />
                          </div>
                          <input
                            type="tel"
                            required
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className={inputClass}
                            placeholder="10-Digit Mobile Number"
                            pattern="[0-9]{10}"
                            title="Please enter a valid 10-digit mobile number"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Email */}
                  <div className="flex flex-col gap-2">
                    <label className={labelClass}>Email Address</label>
                    <div className="relative">
                      <div className={iconWrapperClass}>
                        <Mail size={18} />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputClass}
                        placeholder="owner@restaurant.com"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className={labelClass}>Password</label>
                      {isLogin && (
                        <button
                          type="button"
                          onClick={() => setShowForgotPassword(true)}
                          className="text-xs font-bold text-orange-500 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-300 transition-colors"
                        >
                          Forgot Password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <div className={iconWrapperClass}>
                        <Lock size={18} />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={inputClass.replace('pr-4', 'pr-12')}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Remember Me Toggle */}
                  {isLogin && (
                    <div className="flex items-center gap-3 mt-1">
                      <div
                        role="presentation"
                        onClick={() => setRememberMe(!rememberMe)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                          rememberMe
                            ? 'bg-gradient-to-r from-orange-500 to-orange-600'
                            : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={() => {}}
                          className="sr-only"
                          title="Remember Email"
                          aria-label="Remember Email"
                        />
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            rememberMe ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </div>
                      <label
                        onClick={() => setRememberMe(!rememberMe)}
                        className="text-sm font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none transition-colors"
                      >
                        Remember Email
                      </label>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading || (loginLockedUntil != null && lockCountdown > 0) || (signupBlocked && !isLogin)}
                    className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-4 rounded-xl mt-3 transition-all duration-200 shadow-lg shadow-orange-500/20 dark:shadow-orange-500/10 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-xl hover:shadow-orange-500/25 active:scale-[0.98]"
                  >
                    {loading ? <Loader2 size={20} className="animate-spin" /> : (isLogin ? 'Sign In to Dashboard' : 'Create Free Account')}
                    {!loading && <ArrowRight size={18} />}
                  </button>
                </form>
              )}

              {/* ── Toggle Login / Register ── */}
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium transition-colors">
                  {isLogin ? "Don't have an account? " : "Already have an account? "}
                  <button
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setError('');
                    }}
                    className="text-orange-500 dark:text-orange-400 font-bold hover:text-orange-600 dark:hover:text-orange-300 transition-colors"
                  >
                    {isLogin ? 'Sign up now' : 'Sign in instead'}
                  </button>
                </p>
              </div>
            </>
          )}

          {/* Notice removed */}
        </div>

        {/* ── Subtle bottom branding ── */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-6 font-medium transition-colors">
          © {new Date().getFullYear()} Siya Bill · All rights reserved
        </p>
      </div>

      {/* ── Forgot Password Modal Overlay ── */}
      {/* (Modal functionality is inline above, but we keep this comment for parity) */}
    </div>
  );
}
