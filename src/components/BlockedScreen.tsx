import { useState, useEffect } from 'react';
import { ShieldX, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabase';
import { db } from '../db';
import { useToast } from './Toast';

interface Props {
  blockedUntilEpoch: number;  // Unix timestamp (seconds)
  warningCount: number;
  userId: string;
  onUnblocked: () => void;
}

export default function BlockedScreen({ blockedUntilEpoch, warningCount, userId, onUnblocked }: Props) {
  const { showToast } = useToast();
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // Unblock request states
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, blockedUntilEpoch - Math.floor(Date.now() / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        onUnblocked();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [blockedUntilEpoch, onUnblocked]);

  const handleSendUnblockRequest = async () => {
    if (!requestReason.trim()) return;
    setIsSubmitting(true);
    try {
      if (!supabase) {
        throw new Error('Cloud database not connected');
      }

      // Fetch restaurant settings/profile details from local database
      let restCode = 'UNKNOWN';
      let restName = 'Unknown Restaurant';
      try {
        const profile = await db.restaurantProfile.get('global');
        if (profile) {
          restCode = profile.restaurantCode || 'UNKNOWN';
          restName = profile.restaurantName || 'Unknown Restaurant';
        }
      } catch (dbErr) {
        console.error('Dexie profile fetch failed:', dbErr);
      }

      const { error } = await supabase
        .from('support_tickets')
        .insert({
          app_user_id: userId,
          restaurant_code: restCode,
          restaurant_name: restName,
          category: 'unblock',
          subject: 'Account Unblock Request',
          description: `UNBLOCK REQUEST: ${requestReason.trim()} (User Warnings: ${warningCount}/5)`,
          priority: 'high',
          status: 'open',
          replies: []
        });

      if (error) throw error;
      setSubmitted(true);
      showToast('Unblock request submitted successfully!', 'success');
    } catch (err: any) {
      console.error('Failed to submit unblock request:', err);
      showToast(err.message || 'Submission failed. Please contact admin.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hours   = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  const unblockTime = new Date(blockedUntilEpoch * 1000).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-red-950 via-slate-950 to-red-900 font-sans overflow-y-auto py-8">

      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 rounded-full bg-red-600/10 blur-3xl animate-pulse animate-duration-4s" />
        <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 rounded-full bg-red-500/10 blur-3xl animate-pulse animate-duration-6s" />
      </div>

      {/* Main Card */}
      <div className="relative z-10 w-full max-w-md mx-4 my-auto">
        <div className="bg-white/5 backdrop-blur-2xl border border-red-500/20 rounded-3xl shadow-2xl shadow-red-900/50 p-6 sm:p-8 flex flex-col items-center gap-5">

          {/* Lock Icon with pulse ring */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping animate-duration-2s" />
            <div className="relative bg-gradient-to-br from-red-600 to-red-800 w-16 h-16 rounded-full flex items-center justify-center shadow-lg shadow-red-700/40">
              <ShieldX size={30} className="text-white" />
            </div>
          </div>

          {/* Title */}
          <div className="text-center">
            <h1 className="text-xl font-black text-white tracking-tight">Account Blocked</h1>
            <p className="text-red-300/85 text-xs font-bold mt-1.5">
              Today <span className="text-red-300 font-black">{warningCount}/5</span> rate limit violations occurred
            </p>
          </div>

          {/* Countdown Timer */}
          <div className="w-full bg-black/35 border border-red-500/20 rounded-2xl p-5 flex flex-col items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-red-400 text-xs font-black uppercase tracking-wider">
              <Clock size={12} />
              <span>Time Until Unlock</span>
            </div>
            <div className="flex items-center gap-2.5">
              {[pad(hours), pad(minutes), pad(seconds)].map((unit, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="bg-red-950/60 border border-red-500/30 rounded-xl px-3.5 py-2.5 min-w-[3.5rem] text-center">
                    <span className="text-3xl font-black text-white tabular-nums">{unit}</span>
                  </div>
                  {i < 2 && <span className="text-red-400 text-2xl font-black">:</span>}
                </div>
              ))}
            </div>
            <p className="text-red-400/60 text-xs font-bold">
              {secondsLeft > 0 ? `Will unlock automatically after ${unblockTime}` : 'Unblocking...'}
            </p>
          </div>

          {/* Warning message */}
          <div className="w-full bg-amber-500/10 border border-amber-500/20 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-300/80 text-xs font-bold leading-normal">
              Attempted to create more than 20 bills in a minute. This account has been blocked for security purposes.
            </p>
          </div>

          {/* Contact info */}
          <div className="text-center">
            <p className="text-slate-400 text-xs font-bold">Please contact admin for support</p>
            <p className="text-slate-300 text-xs font-black mt-0.5 break-all">gudduk483@gmail.com</p>
          </div>

          {/* Unblock Request Form */}
          <div className="w-full border-t border-red-500/10 pt-5 mt-1 flex flex-col gap-2.5">
            {!showRequestForm ? (
              <button
                onClick={() => setShowRequestForm(true)}
                className="w-full py-2.5 px-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-xs font-black text-red-300 transition-all active:scale-95"
              >
                🔓 Request Account Unblock
              </button>
            ) : submitted ? (
              <div className="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3.5 text-center flex flex-col items-center gap-1.5 animate-in zoom-in-95 duration-200">
                <span className="text-emerald-400 text-xs font-black uppercase tracking-wider">Request Sent Successfully!</span>
                <p className="text-slate-300 text-xs font-medium leading-relaxed">
                  Your unblock request has been sent to the Super Admin. They will review it shortly to reactivate your account.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 animate-in slide-in-from-top-3 duration-200 w-full">
                <textarea
                  rows={3}
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="Limit exceeded in a minute. Please unblock my account..."
                  className="w-full p-2.5 border border-red-500/20 rounded-xl focus:ring-1 focus:ring-red-500 outline-none text-sm font-semibold text-slate-200 bg-black/40 placeholder-slate-500 transition-colors"
                />
                <div className="flex gap-2 w-full">
                  <button
                    onClick={() => setShowRequestForm(false)}
                    className="flex-1 py-3 bg-slate-900 hover:bg-slate-900 text-slate-400 border border-slate-800 rounded-xl text-xs font-black transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendUnblockRequest}
                    disabled={isSubmitting || !requestReason.trim()}
                    className="flex-1 py-3 bg-gradient-to-r from-red-700 to-red-800 hover:from-red-600 hover:to-red-700 text-white rounded-xl text-xs font-black transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Sending...' : 'Submit Request'}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
