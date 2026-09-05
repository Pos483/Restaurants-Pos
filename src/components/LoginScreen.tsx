import { useState, useEffect, useRef } from 'react';
import { 
  Mail, ArrowRight, Loader2, Eye, EyeOff, Lock, 
  Sun, Moon,
  HelpCircle, RefreshCw, CheckCircle2
} from 'lucide-react';
import { supabase } from '../supabase';
import { User } from '@supabase/supabase-js';
import { useToast } from './Toast';
import { useTheme } from '../contexts/ThemeContext';

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
  const { toggleTheme, isDark } = useTheme();

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
  
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [loginLockedUntil, setLoginLockedUntil] = useState<number | null>(null);
  const [lockCountdown, setLockCountdown] = useState(0);
  const [signupBlocked, setSignupBlocked] = useState(false);
  const [signupBlockedUntil, setSignupBlockedUntil] = useState<number | null>(null);
  const [signupCountdown, setSignupCountdown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  // ─── Splash Animation ─────────────────────────────────────────────────
  const [splashPhase, setSplashPhase] = useState<'logo-in' | 'logo-hold' | 'logo-out' | 'done'>('logo-in');
  const logoTargetRef = useRef<HTMLDivElement>(null);

  // ─── Effects ──────────────────────────────────────────────────────────────

  // Splash animation sequence
  useEffect(() => {
    // Phase 1: Logo scales in (CSS handles this)
    const t1 = setTimeout(() => setSplashPhase('logo-hold'), 100);
    // Phase 2: Hold the logo centered
    const t2 = setTimeout(() => setSplashPhase('logo-out'), 1200);
    // Phase 3: Logo shrinks and flies to final position
    const t3 = setTimeout(() => setSplashPhase('done'), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);


  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) { 
      setEmail(savedEmail); 
      setRememberMe(true); 
    }
    localStorage.removeItem('rememberedPassword');
  }, []);

  useEffect(() => {
    const pendingEmail = localStorage.getItem('pendingVerificationEmail');
    if (pendingEmail) { 
      setVerifyEmail(pendingEmail); 
      setShowVerifyEmail(true); 
    }
    const hash = window.location.hash;
    if (hash && hash.includes('error=')) {
      const params = new URLSearchParams(hash.substring(1));
      const errorMsg = params.get('error_description') || params.get('error') || 'Authentication failed.';
      setError(decodeURIComponent(errorMsg).replace(/\+/g, ' '));
      window.history.replaceState(null, '', window.location.origin);
    }
  }, []);

  const checkVerificationStatus = async (showFeedback = false) => {
    if (!supabase || !verifyEmail || !tempPassword) return;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email: verifyEmail, 
        password: tempPassword 
      });
      if (error) { 
        if (showFeedback) showToast('Email not yet verified. Please check your inbox.', 'error'); 
        return; 
      }
      if (data.user) {
        showToast('Email verified! Welcome to Siya Bill.', 'success');
        setShowVerifyEmail(false); 
        setTempPassword('');
        localStorage.removeItem('pendingVerificationEmail');
        handleSuccessfulLogin(data.user);
      }
    } catch (_) { /* ignore */ }
  };

  useEffect(() => {
    if (!showVerifyEmail || !tempPassword) return;
    const interval = setInterval(() => checkVerificationStatus(false), 5000);
    return () => clearInterval(interval);
  }, [showVerifyEmail, tempPassword, verifyEmail]);

  useEffect(() => {
    const stored = localStorage.getItem(`loginAttempts_${email}`);
    if (stored) {
      const { attempts, lockedUntil } = JSON.parse(stored);
      setLoginAttempts(attempts || 0);
      setLoginLockedUntil(lockedUntil && lockedUntil > Date.now() ? lockedUntil : null);
    }
  }, [email]);

  useEffect(() => {
    if (!loginLockedUntil) { setLockCountdown(0); return; }
    const tick = () => { 
      const r = Math.max(0, Math.ceil((loginLockedUntil - Date.now()) / 1000)); 
      setLockCountdown(r); 
      if (r === 0) setLoginLockedUntil(null); 
    };
    tick(); 
    const interval = setInterval(tick, 1000); 
    return () => clearInterval(interval);
  }, [loginLockedUntil]);

  useEffect(() => {
    const fp = getDeviceFingerprint();
    const stored = localStorage.getItem(`signupLog_${fp}`);
    if (stored) {
      const { signups, blockedUntil } = JSON.parse(stored);
      if (blockedUntil && blockedUntil > Date.now()) { 
        setSignupBlocked(true); 
        setSignupBlockedUntil(blockedUntil); 
      } else {
        const fresh = (signups || []).filter((t: number) => t > Date.now() - 86400000);
        if (fresh.length >= 3) { 
          const bu = Math.min(...fresh) + 86400000; 
          setSignupBlocked(true); 
          setSignupBlockedUntil(bu); 
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!signupBlockedUntil) { setSignupCountdown(0); return; }
    const tick = () => { 
      const r = Math.max(0, Math.ceil((signupBlockedUntil - Date.now()) / 1000)); 
      setSignupCountdown(r); 
      if (r === 0) { 
        setSignupBlocked(false); 
        setSignupBlockedUntil(null); 
      } 
    };
    tick(); 
    const interval = setInterval(tick, 1000); 
    return () => clearInterval(interval);
  }, [signupBlockedUntil]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const getLoginDelay = (a: number) => a <= 2 ? 0 : a === 3 ? 5000 : a === 4 ? 30000 : a === 5 ? 120000 : 900000;

  const recordFailedAttempt = (cur: number) => {
    const n = cur + 1, d = getLoginDelay(n), lu = d > 0 ? Date.now() + d : null;
    setLoginAttempts(n); 
    setLoginLockedUntil(lu);
    localStorage.setItem(`loginAttempts_${email}`, JSON.stringify({ attempts: n, lockedUntil: lu }));
  };

  const clearLoginAttempts = () => { 
    setLoginAttempts(0); 
    setLoginLockedUntil(null); 
    localStorage.removeItem(`loginAttempts_${email}`); 
  };

  const recordSignupAttempt = () => {
    const fp = getDeviceFingerprint();
    const stored = localStorage.getItem(`signupLog_${fp}`);
    const existing = stored ? JSON.parse(stored) : { signups: [] };
    const fresh = (existing.signups || []).filter((t: number) => t > Date.now() - 86400000);
    fresh.push(Date.now());
    let bu: number | null = null;
    if (fresh.length >= 3) { 
      bu = Math.min(...fresh) + 86400000; 
      setSignupBlocked(true); 
      setSignupBlockedUntil(bu); 
    }
    localStorage.setItem(`signupLog_${fp}`, JSON.stringify({ signups: fresh, blockedUntil: bu }));
  };

  const handleSuccessfulLogin = (user: User) => {
    clearLoginAttempts();
    if (rememberMe) localStorage.setItem('rememberedEmail', email);
    else localStorage.removeItem('rememberedEmail');
    onLoginSuccess(user);
  };

  // ─── Form Handlers ────────────────────────────────────────────────────────

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!navigator.onLine) { 
      setError('An active internet connection is required for password reset.'); 
      return; 
    }
    setLoading(true); 
    setError('');
    try {
      if (!supabase) throw new Error('Database service unavailable.');
      const rawSiteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
      const siteUrl = rawSiteUrl.endsWith('/') ? rawSiteUrl : `${rawSiteUrl}/`;
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo: siteUrl });
      if (error) throw error;
      showToast('Password reset link has been sent to your email!', 'success');
      setShowForgotPassword(false);
    } catch (err: any) { 
      setError(err.message || 'An error occurred during password reset.'); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginLockedUntil && loginLockedUntil > Date.now()) { 
      setError(`Too many failed attempts. Please wait ${lockCountdown} seconds.`); 
      return; 
    }
    if (!isLogin) {
      const domain = email.split('@')[1]?.toLowerCase() || '';
      if (BLOCKED_EMAIL_DOMAINS.includes(domain)) { 
        setError('Temporary or disposable email addresses are not allowed. Please enter a valid email.'); 
        return; 
      }
      if (signupBlocked) { 
        setError(`Daily account creation limit reached from this device. Please try again in ${Math.ceil(signupCountdown / 3600)} hours.`); 
        return; 
      }
    }
    if (!navigator.onLine) { 
      setError('An active internet connection is required to sign in or register.'); 
      return; 
    }
    setLoading(true); 
    setError('');

    try {
      if (!supabase) throw new Error('Database service unavailable. Please contact support.');
      
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) handleSuccessfulLogin(data.user);
      } else {
        if (!phone.trim()) throw new Error('A valid 10-digit mobile number is required!');
        const rawSiteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
        const siteUrl = rawSiteUrl.endsWith('/') ? rawSiteUrl : `${rawSiteUrl}/`;
        const { data, error } = await supabase.auth.signUp({
          email, 
          password,
          options: { 
            emailRedirectTo: siteUrl, 
            data: { 
              restaurant_name: restaurantName, 
              phone: phone.trim() 
            } 
          }
        });
        if (error) throw error;
        if (data?.session && data.user) { 
          recordSignupAttempt(); 
          showToast('Account created successfully!', 'success'); 
          handleSuccessfulLogin(data.user); 
        } else {
          recordSignupAttempt(); 
          showToast('Account created! Please check your verification email.', 'success');
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
      if (isLogin) recordFailedAttempt(loginAttempts); 
      setError(err.message || 'Authentication error.'); 
    } finally { 
      setLoading(false); 
    }
  };

  // ─── Styles ──────────────────────────────────────────────────────────────

  const inputClass = "w-full px-4 py-3 rounded-xl text-sm bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 focus:bg-white dark:focus:bg-slate-800 transition-all duration-200 backdrop-blur-sm";

  return (
    <div className="h-screen w-full flex items-center justify-center font-sans selection:bg-orange-500 selection:text-white overflow-hidden relative bg-gradient-to-br from-orange-50 via-white to-amber-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">

      {/* CSS Keyframes */}
      <style>{`
        @keyframes logoFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-150%) rotate(25deg); }
          100% { transform: translateX(150%) rotate(25deg); }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.15); }
        }
        @keyframes borderSpin {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes splashPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(249,115,22,0.4); }
          50% { box-shadow: 0 0 0 20px rgba(249,115,22,0); }
        }
      `}</style>

      {/* ═══ SPLASH OVERLAY ═══ */}
      {splashPhase !== 'done' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">

          {/* Pulsing glow rings */}
          <div
            className="absolute rounded-full"
            style={{
              width: '260px', height: '260px',
              background: 'radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 70%)',
              animation: splashPhase === 'logo-hold' ? 'pulseGlow 2s ease-in-out infinite' : 'none',
              opacity: splashPhase === 'logo-in' ? 0 : 1,
              transition: 'opacity 0.5s',
            }}
          />

          {/* Main splash logo */}
          <div
            className="rounded-3xl flex items-center justify-center relative overflow-hidden"
            style={{
              transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              width: splashPhase === 'logo-out' ? '112px' : '180px',
              height: splashPhase === 'logo-out' ? '96px' : '180px',
              opacity: splashPhase === 'logo-in' ? 0 : 1,
              transform: splashPhase === 'logo-in'
                ? 'scale(0.3) rotate(-10deg)'
                : splashPhase === 'logo-hold'
                  ? 'scale(1) rotate(0deg)'
                  : 'scale(0.6)',
              background: 'linear-gradient(135deg, #f97316, #f59e0b, #f97316, #ea580c)',
              backgroundSize: '200% 200%',
              animation: splashPhase === 'logo-hold'
                ? 'borderSpin 3s linear infinite, splashPulse 1.5s ease-in-out infinite'
                : 'borderSpin 3s linear infinite',
              padding: '3px',
            }}
          >
            <div className="w-full h-full rounded-[21px] bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden p-4 relative">
              <img src="/icon.png" alt="Siya Bill" className="w-full h-full object-contain relative z-10" />
              {/* Shimmer sweep */}
              <div
                className="absolute inset-0 z-20 pointer-events-none"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                  animation: splashPhase === 'logo-hold' ? 'shimmer 2s ease-in-out infinite' : 'none',
                  width: '60%', height: '100%',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Subtle ambient glow */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-400/10 dark:bg-orange-500/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-amber-300/10 dark:bg-amber-500/5 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4" />

      {/* Large blended watermark logo behind */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <img
          src="/icon.png"
          alt=""
          className="w-[500px] h-[500px] object-contain opacity-[0.04] dark:opacity-[0.03] select-none"
          draggable={false}
        />
      </div>

      {/* Top-right controls */}
      <div
        className="absolute top-4 right-4 z-20 flex items-center gap-2 transition-all duration-700"
        style={{ opacity: splashPhase === 'done' ? 1 : 0, transform: splashPhase === 'done' ? 'translateY(0)' : 'translateY(-10px)' }}
      >
        <a
          href="https://wa.me/918677994666?text=Hi%20Guddu,%20I%20need%20help%20with%20Siya%20Bill%20POS"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 transition-all"
        >
          <HelpCircle size={13} className="text-orange-500" />
          Support
        </a>
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-full bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 transition-all cursor-pointer"
          title={isDark ? "Light Mode" : "Dark Mode"}
          aria-label="Toggle Theme"
        >
          {isDark ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} />}
        </button>
      </div>

      {/* ── Main Card ── */}
      <div
        className="relative z-10 w-full max-w-md mx-4 transition-all duration-700"
        style={{ opacity: splashPhase === 'done' ? 1 : 0, transform: splashPhase === 'done' ? 'translateY(0)' : 'translateY(20px)' }}
      >

        <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl rounded-3xl shadow-xl shadow-black/5 dark:shadow-black/30 border border-white/80 dark:border-slate-800/80 p-8 sm:p-10">

          {/* Logo — animated */}
          <div className="flex flex-col items-center text-center mb-8" ref={logoTargetRef}>
            <div
              className="w-28 h-24 rounded-2xl relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #f97316, #f59e0b, #f97316, #ea580c)',
                backgroundSize: '200% 200%',
                animation: 'borderSpin 4s linear infinite, logoFloat 3s ease-in-out infinite',
                padding: '2px',
                boxShadow: '0 8px 30px rgba(249,115,22,0.2)',
              }}
            >
              <div className="w-full h-full rounded-[14px] bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden p-3 relative">
                <img src="/icon.png" alt="Siya Bill" className="w-full h-full object-contain relative z-10" />
                {/* Shimmer shine */}
                <div
                  className="absolute inset-0 z-20 pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                    animation: 'shimmer 3s ease-in-out infinite',
                    animationDelay: '1s',
                    width: '50%', height: '100%',
                  }}
                />
              </div>
            </div>
          </div>


          {/* Title */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-black tracking-tight bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 bg-clip-text text-transparent">
              {showForgotPassword ? 'Reset Password' : 'SIYA BILL'}
            </h2>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1 tracking-wide">
              {showForgotPassword
                ? 'Enter your email to reset password'
                : 'Smart Restaurant POS & Billing Solution'}
            </p>
          </div>

          {/* Verification Pending */}
          {showVerifyEmail ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-100 dark:bg-orange-950/50 text-orange-500 flex items-center justify-center">
                <Mail size={26} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Verify Your Email</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Verification link sent to <span className="font-semibold text-slate-700 dark:text-slate-200 break-all">{verifyEmail}</span>
                </p>
                <div className="inline-flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400 font-semibold mt-3 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/40">
                  <RefreshCw size={12} className="animate-spin" /> Checking...
                </div>
              </div>

              {tempPassword && (
                <button
                  type="button"
                  onClick={() => checkVerificationStatus(true)}
                  className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
                >
                  I've Verified <ArrowRight size={15} />
                </button>
              )}

              <div className="text-center space-y-2 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (!supabase) return;
                      const { error } = await supabase.auth.resend({
                        type: 'signup',
                        email: verifyEmail,
                      });
                      if (error) throw error;
                      showToast('Verification email resent!', 'success');
                    } catch (err: any) {
                      showToast('Resend failed.', 'error');
                    }
                  }}
                  className="text-sm font-semibold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                >
                  Resend email
                </button>
                <br />
                <button
                  type="button"
                  onClick={() => {
                    setShowVerifyEmail(false);
                    setTempPassword('');
                    localStorage.removeItem('pendingVerificationEmail');
                    setIsLogin(true);
                  }}
                  className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  ← Back to sign in
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">

              {/* Lockout */}
              {loginLockedUntil && lockCountdown > 0 && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40 text-amber-700 dark:text-amber-300 text-sm font-medium">
                  <Lock size={15} className="shrink-0" />
                  Too many failed attempts. Wait {Math.floor(lockCountdown / 60)}:{String(lockCountdown % 60).padStart(2, '0')}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200/60 dark:border-red-800/40 text-red-600 dark:text-red-300 text-sm font-medium">
                  {error}
                </div>
              )}

              {/* Forgot Password Form */}
              {showForgotPassword ? (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Email Address</label>
                    <input type="email" required value={resetEmail} onChange={e => setResetEmail(e.target.value)} className={inputClass} placeholder="your@email.com" />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-sm rounded-xl shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] cursor-pointer transition-all"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <><span>Send Reset Link</span><ArrowRight size={15} /></>}
                  </button>
                  <button type="button" onClick={() => setShowForgotPassword(false)} className="w-full text-center text-sm font-semibold text-slate-500 hover:text-orange-600 dark:text-slate-400 cursor-pointer">
                    ← Back to login
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">

                  {/* Sign Up Fields */}
                  {!isLogin && (
                    <>
                      <div className="space-y-1.5">
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Restaurant Name</label>
                        <input type="text" required value={restaurantName} onChange={e => setRestaurantName(e.target.value)} className={inputClass} placeholder="Your restaurant name" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Mobile Phone</label>
                        <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} placeholder="10-digit mobile number" pattern="[0-9]{10}" title="10-digit number" />
                      </div>
                    </>
                  )}

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Email Address</label>
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputClass} placeholder="your@email.com" />
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Password</label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} className={inputClass + ' pr-10'} placeholder="••••••••" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Remember + Forgot */}
                  {isLogin && (
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setRememberMe(!rememberMe)}>
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${rememberMe ? 'bg-orange-500 border-orange-500' : 'border-slate-300 dark:border-slate-600'}`}>
                          {rememberMe && <CheckCircle2 size={12} className="text-white" strokeWidth={3} />}
                        </div>
                        <span className="text-sm text-slate-600 dark:text-slate-400">Remember me</span>
                      </label>
                      <button type="button" onClick={() => setShowForgotPassword(true)} className="text-sm font-semibold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer">
                        Forgot password?
                      </button>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-600 hover:via-amber-600 hover:to-orange-600 text-white font-bold text-sm rounded-xl shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] cursor-pointer transition-all"
                  >
                    {loading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <>
                        <span>{isLogin ? 'Sign In to Dashboard' : 'Create Account'}</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Switch mode */}
              <div className="pt-2 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {isLogin ? "Don't have an account? " : "Already have an account? "}
                  <button
                    type="button"
                    onClick={() => { setIsLogin(!isLogin); setError(''); setShowForgotPassword(false); }}
                    className="font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                  >
                    {isLogin ? 'Sign Up' : 'Sign In'}
                  </button>
                </p>
              </div>

            </div>
          )}
        </div>

        {/* Footer below card */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4">
          © {new Date().getFullYear()} Siya Bill POS · v{import.meta.env.VITE_APP_VERSION || '3.4.4'}
        </p>

      </div>
    </div>
  );
}

