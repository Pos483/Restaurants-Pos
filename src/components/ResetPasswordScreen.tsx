import React, { useState } from 'react';
import { Utensils, Lock, ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../supabase';
import { useToast } from './Toast';
import { useApp } from '../contexts/AppContext';

export default function ResetPasswordScreen() {
  const { showToast } = useToast();
  const { setIsRecoveryMode } = useApp();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }

    if (!navigator.onLine) {
      setError('An active internet connection is required to reset your password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (!supabase) {
        throw new Error('Database is not connected! Please try again later.');
      }

      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      showToast('Password updated successfully! Welcome back to Siya Bill.', 'success');
      
      // Clear URL hash to prevent triggering recovery mode again
      window.history.replaceState(null, '', window.location.origin);
      
      // Navigate to dashboard
      setIsRecoveryMode(false);
    } catch (err: any) {
      setError(err.message || 'An error occurred during password update.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = `w-full pl-12 pr-12 py-3.5 rounded-xl font-medium transition-all duration-200
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
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-indigo-500/10 dark:from-orange-500/5 dark:via-transparent dark:to-indigo-500/5" />
        {/* Animated floating orbs */}
        <div className="absolute top-[-20%] left-[-10%] w-[40rem] h-[40rem] rounded-full bg-orange-400/20 dark:bg-orange-500/10 blur-3xl animate-pulse [animation-duration:8s]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[35rem] h-[35rem] rounded-full bg-indigo-400/20 dark:bg-indigo-500/10 blur-3xl animate-pulse [animation-duration:10s]" />
        
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[radial-gradient(circle,_#000000_1px,_transparent_1px)] dark:bg-[radial-gradient(circle,_#ffffff_1px,_transparent_1px)] bg-[size:32px_32px]"
        />
      </div>

      {/* ── Glass Card ── */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-2xl rounded-3xl border border-white/50 dark:border-white/10 shadow-2xl shadow-black/5 dark:shadow-black/30 p-5 sm:p-10 transition-all duration-300">
          
          {/* Brand Header */}
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
              Set New Password
            </p>
          </div>

          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 tracking-tight transition-colors">
              Reset Password
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-1.5 transition-colors">
              Enter your new password to access the dashboard.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl mb-5 text-sm font-bold flex items-center gap-2 transition-colors animate-[fadeIn_0.2s_ease-out]">
              <span className="flex-1">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* New Password */}
            <div className="flex flex-col gap-2">
              <label className={labelClass}>New Password</label>
              <div className="relative">
                <div className={iconWrapperClass}>
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
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

            {/* Confirm Password */}
            <div className="flex flex-col gap-2">
              <label className={labelClass}>Confirm Password</label>
              <div className="relative">
                <div className={iconWrapperClass}>
                  <Lock size={18} />
                </div>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-4 rounded-xl mt-2 transition-all duration-200 shadow-lg shadow-orange-500/20 dark:shadow-orange-500/10 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-xl hover:shadow-orange-500/25 active:scale-[0.98]"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : 'Update Password'}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-6 font-medium transition-colors">
          © {new Date().getFullYear()} Siya Bill · All rights reserved
        </p>
      </div>

    </div>
  );
}
