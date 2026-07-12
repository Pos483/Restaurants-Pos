import { useState, useEffect } from 'react';
import { useLiveQuery } from '../db';
import { db } from '../db';
import { Store, Phone, Mail, MapPin, FileText, Save, Percent, MessageSquare, Copy, Check, Lock, ShieldCheck, Loader2, Smartphone, Sparkles, Trash2, RefreshCcw, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { supabase } from '../supabase';
import { useToast } from './Toast';

export default function RestaurantProfile() {
  const globalSettings = useLiveQuery(async () => {
    const profile = await db.restaurantProfile.get('global');
    const sys = await db.restaurantSettings.get('global');
    return { ...(profile || {}), ...(sys || {}) };
  }, [], ['restaurant_profile', 'restaurant_settings']);
  const { showToast } = useToast();
  
  const [formData, setFormData] = useState({
    restaurantName: 'Restaurant POS',
    phone: '',
    email: '',
    address: '',
    gstNumber: '',
    fssaiNumber: '',
    gstPercentage: '5',
    thankYouMessage: 'Thank You for Visiting! Please Visit Again',
    upiId: '',
    upiEnabled: false
  });

  const [copied, setCopied] = useState(false);
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [passLoading, setPassLoading] = useState(false);

  // Account Management State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [acctReqLoading, setAcctReqLoading] = useState(false);
  const [existingRequest, setExistingRequest] = useState<{
    id: string;
    request_type: string;
    status: string;
    expires_at: string;
    reason: string;
  } | null>(null);
  const [cancelReqLoading, setCancelReqLoading] = useState(false);

  const copyCode = () => {
    if (globalSettings?.restaurantCode) {
      navigator.clipboard.writeText(globalSettings.restaurantCode);
      setCopied(true);
      showToast('Restaurant Code Copied!', 'info');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Fetch existing pending account request
  const fetchExistingRequest = async () => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('account_requests')
        .select('id, request_type, status, expires_at, reason')
        .eq('app_user_id', user.id)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setExistingRequest(data || null);
    } catch (err) {
      console.error('Failed to fetch account requests:', err);
    }
  };

  const handleDeleteRequest = async () => {
    if (!deleteReason.trim()) { showToast('Please provide a reason.', 'error'); return; }
    if (!supabase) { showToast('Not connected to cloud.', 'error'); return; }
    setAcctReqLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const profile = await db.restaurantProfile.get('global');
      const { error } = await supabase.from('account_requests').insert({
        app_user_id: user.id,
        restaurant_name: profile?.restaurantName || 'Unknown',
        email: user.email || '',
        request_type: 'delete',
        reason: deleteReason.trim(),
      });
      if (error) throw error;
      showToast('Delete request submitted. Account will be deleted within 24 hours unless rejected by admin.', 'success');
      setShowDeleteModal(false); setDeleteReason('');
      fetchExistingRequest();
    } catch (err: any) {
      showToast('Failed to submit: ' + err.message, 'error');
    } finally { setAcctReqLoading(false); }
  };

  const handleResetRequest = async () => {
    if (!resetReason.trim()) { showToast('Please provide a reason.', 'error'); return; }
    if (!supabase) { showToast('Not connected to cloud.', 'error'); return; }
    setAcctReqLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const profile = await db.restaurantProfile.get('global');
      const { error } = await supabase.from('account_requests').insert({
        app_user_id: user.id,
        restaurant_name: profile?.restaurantName || 'Unknown',
        email: user.email || '',
        request_type: 'reset',
        reason: resetReason.trim(),
      });
      if (error) throw error;
      showToast('Reset request submitted. Account will be reset within 24 hours unless rejected by admin.', 'success');
      setShowResetModal(false); setResetReason('');
      fetchExistingRequest();
    } catch (err: any) {
      showToast('Failed to submit: ' + err.message, 'error');
    } finally { setAcctReqLoading(false); }
  };

  const handleCancelRequest = async () => {
    if (!existingRequest || !supabase) return;
    setCancelReqLoading(true);
    try {
      const { error } = await supabase.from('account_requests').update({ status: 'cancelled' }).eq('id', existingRequest.id);
      if (error) throw error;
      showToast('Request cancelled successfully.', 'success');
      setExistingRequest(null);
    } catch (err: any) {
      showToast('Failed to cancel: ' + err.message, 'error');
    } finally { setCancelReqLoading(false); }
  };

  const getExpiryCountdown = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Executing soon...';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m remaining`;
  };

  useEffect(() => {
    if (globalSettings) {
      setFormData({
        restaurantName: globalSettings.restaurantName || 'Restaurant POS',
        phone: globalSettings.phone || '',
        email: globalSettings.email || '',
        address: globalSettings.address || '',
        gstNumber: globalSettings.gstNumber || '',
        fssaiNumber: globalSettings.fssaiNumber || '',
        gstPercentage: globalSettings.gstPercentage?.toString() || '5',
        thankYouMessage: globalSettings.thankYouMessage || 'Thank You for Visiting! Please Visit Again',
        upiId: globalSettings.upiId || '',
        upiEnabled: globalSettings.upiEnabled || false
      });
    }
  }, [globalSettings]);

  // Fetch existing pending request on mount
  useEffect(() => { fetchExistingRequest(); }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement;
    if (target.type === 'checkbox') {
      setFormData({ ...formData, [target.name]: target.checked });
    } else {
      setFormData({ ...formData, [target.name]: target.value });
    }
  };

  const handleSave = async () => {
    try {
      await db.restaurantProfile.put({
        ...(globalSettings || {}),
        id: 'global',
        restaurantName: formData.restaurantName,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        gstNumber: formData.gstNumber,
        fssaiNumber: formData.fssaiNumber,
        gstPercentage: Number(formData.gstPercentage) || 0,
        thankYouMessage: formData.thankYouMessage,
        upiId: formData.upiId,
        upiEnabled: formData.upiEnabled
      } as any);
      showToast('Restaurant Profile Updated Successfully!');
    } catch (err: any) {
      console.error('Error saving profile:', err);
      showToast(`Error saving profile: ${err.message}`, 'error');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordData.newPassword || passwordData.newPassword.length < 6) {
      showToast('Password must be at least 6 characters!', 'error');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showToast('Passwords do not match!', 'error');
      return;
    }

    setPassLoading(true);
    try {
      if (!supabase) throw new Error('Database is not connected!');
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });
      if (error) throw error;
      showToast('Password updated successfully!');
      setPasswordData({ newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      showToast('Error updating password: ' + err.message, 'error');
    } finally {
      setPassLoading(false);
    }
  };

  if (globalSettings === undefined) return (
    <div className="h-full flex items-center justify-center bg-[#FAFBFC] dark:bg-[#0B0F19] transition-colors">
       <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-gray-500 dark:text-slate-400 font-bold text-lg">Loading Profile...</div>
       </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-6 overflow-auto w-full pb-12 transition-colors">
      
      {/* Top Banner Header matching App design language */}
      <div className="flex items-center justify-between glass-card-solid p-6 rounded-3xl shadow-sm shrink-0 transition-colors">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-50 dark:bg-indigo-950/40 p-3.5 rounded-2xl text-indigo-600 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-900/60 transition-colors">
            <Store size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800 dark:text-slate-100 tracking-tight transition-colors">Restaurant Profile</h1>
            <p className="text-gray-500 dark:text-slate-400 font-medium text-xs sm:text-sm mt-0.5 transition-colors">Manage your digital store branding, tax variables, and invoice footers.</p>
          </div>
        </div>
        <button 
          onClick={handleSave}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center gap-2 text-sm shrink-0 active:scale-95"
        >
          <Save size={18} />
          Save Changes
        </button>
      </div>

      {/* Unique Restaurant Code Card formatted beautifully like Dashboard Stats banner */}
      <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-3xl p-6 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-950/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 p-3.5 rounded-2xl hidden sm:block">
            <Smartphone size={28} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-indigo-100 font-bold text-xs uppercase tracking-wider mb-1">
              <Sparkles size={12} /> Live Device Access Registry
            </div>
            <h2 className="text-lg font-black tracking-tight">Unique App Code</h2>
            <p className="text-xs text-indigo-100 font-medium mt-0.5">Share this registration code to bind Android waiter mobile terminals securely.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 bg-white/10 p-2.5 pl-5 rounded-2xl backdrop-blur-md border border-white/20 self-stretch sm:self-auto justify-between">
          <span className="text-2xl font-black tracking-[0.25em] font-mono text-white">
            {globalSettings?.restaurantCode || '------'}
          </span>
          <button 
            onClick={copyCode}
            className="p-2.5 bg-white text-indigo-600 rounded-xl hover:bg-indigo-50 transition-colors shadow-sm font-bold text-xs flex items-center gap-1"
            title="Copy Code"
          >
            {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
            <span className="hidden md:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Primary Container layout */}
      <div className="glass-card-solid rounded-3xl shadow-sm p-6 sm:p-8 flex flex-col gap-8 transition-colors">
        
        {/* Basic Info */}
        <div>
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-slate-800/50 bg-gray-50 dark:bg-slate-900/40 rounded-t-xl mb-4 transition-colors">
            <h2 className="text-sm font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider transition-colors">Basic Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors">
                <Store size={14} className="text-indigo-500" /> Restaurant Name
              </label>
              <input 
                type="text" 
                name="restaurantName" 
                value={formData.restaurantName} 
                onChange={handleChange} 
                className="input-premium" 
                placeholder="Restaurant Name" 
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors">
                <Phone size={14} className="text-indigo-500" /> Mobile Number
              </label>
              <input 
                type="text" 
                name="phone" 
                value={formData.phone} 
                onChange={handleChange} 
                className="input-premium" 
                placeholder="+91 9876543210" 
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors">
                <Mail size={14} className="text-indigo-500" /> Email Address
              </label>
              <input 
                type="email" 
                name="email" 
                value={formData.email} 
                onChange={handleChange} 
                className="input-premium" 
                placeholder="hello@restaurant.com" 
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors">
                <MapPin size={14} className="text-indigo-500" /> Printable Address
              </label>
              <input 
                type="text" 
                name="address" 
                value={formData.address} 
                onChange={handleChange} 
                className="input-premium" 
                placeholder="123 Food Street, City - 400001" 
              />
            </div>
          </div>
        </div>

        {/* Legal & Compliance */}
        <div>
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-slate-800/50 bg-gray-50 dark:bg-slate-900/40 rounded-t-xl mb-4 transition-colors">
            <h2 className="text-sm font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider transition-colors">Legal Identifiers & Taxes</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 px-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors">
                <FileText size={14} className="text-indigo-500" /> FSSAI Number
              </label>
              <input 
                type="text" 
                name="fssaiNumber" 
                value={formData.fssaiNumber} 
                onChange={handleChange} 
                className="input-premium" 
                placeholder="11512345000123" 
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors">
                <FileText size={14} className="text-indigo-500" /> GST Identification
              </label>
              <input 
                type="text" 
                name="gstNumber" 
                value={formData.gstNumber} 
                onChange={handleChange} 
                className="input-premium uppercase" 
                placeholder="27ABCDE1234F1Z5" 
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors">
                <Percent size={14} className="text-indigo-500" /> Flat Tax Rate (GST %)
              </label>
              <input 
                type="number" 
                name="gstPercentage" 
                value={formData.gstPercentage} 
                onChange={handleChange} 
                className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500 font-bold text-indigo-600 dark:text-indigo-400 text-sm bg-indigo-50/30 dark:bg-indigo-950/20 transition-colors" 
                placeholder="5" 
              />
            </div>
          </div>
        </div>

        {/* Customer Experience: Closings & UPI */}
        <div>
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-slate-800/50 bg-gray-50 dark:bg-slate-900/40 rounded-t-xl mb-4 transition-colors">
            <h2 className="text-sm font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider transition-colors">Receipt Experience & UPI Payments</h2>
          </div>
          
          <div className="flex flex-col gap-5 px-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors">
                <MessageSquare size={14} className="text-indigo-500" /> Printed Thank You Footer Signature
              </label>
              <input 
                type="text" 
                name="thankYouMessage" 
                value={formData.thankYouMessage} 
                onChange={handleChange} 
                className="input-premium" 
                placeholder="Thank You for Visiting! Please Visit Again" 
              />
              <span className="text-xs text-gray-400 dark:text-slate-500 font-medium transition-colors">Printed nicely at the very bottom boundary of every generated slip.</span>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-slate-900/40 rounded-2xl border border-gray-200 dark:border-slate-800/60 flex flex-col gap-4 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white dark:bg-slate-800 rounded-xl text-indigo-600 dark:text-indigo-400 shadow-sm border border-gray-100 dark:border-slate-700 transition-colors">
                    <Smartphone size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-gray-800 dark:text-slate-200 transition-colors">Dynamic Scan-to-Pay Receipt QR</h4>
                    <p className="text-xs text-gray-500 dark:text-slate-400 transition-colors">Automatically renders standard BHIM/UPI code headers directly on finalized checks.</p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    name="upiEnabled"
                    checked={formData.upiEnabled}
                    onChange={handleChange}
                    aria-label="Enable UPI QR code on receipts"
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-slate-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {formData.upiEnabled && (
                <div className="flex flex-col gap-1.5 pt-3 border-t border-gray-200 dark:border-slate-700 animate-in fade-in duration-200">
                  <label className="text-xs font-bold text-gray-700 dark:text-slate-300 transition-colors">Store UPI Address (VPA Identifier)</label>
                  <input 
                    type="text" 
                    name="upiId" 
                    value={formData.upiId} 
                    onChange={handleChange} 
                    className="input-premium" 
                    placeholder="merchant@paytm or 9876543210@upi" 
                  />
                  <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold transition-colors">Tested flawlessly across standard thermal graphic dot buffers.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Security Update */}
        <div className="border-t border-gray-100 dark:border-slate-800/50 pt-6">
          <div className="p-5 bg-orange-50 dark:bg-orange-950/20 rounded-2xl border border-orange-100 dark:border-orange-900/40 flex flex-col gap-4 transition-colors">
            <h3 className="font-bold text-sm text-gray-800 dark:text-slate-200 flex items-center gap-2 transition-colors">
              <Lock size={16} className="text-orange-600 dark:text-orange-400" /> Admin Security Credential Update
            </h3>
            
            <form onSubmit={handlePasswordChange} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-600 dark:text-slate-400 transition-colors">New Administrative Password</label>
                <input 
                  type="password" 
                  value={passwordData.newPassword} 
                  onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})} 
                  className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-500 text-sm font-bold bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 transition-colors" 
                  placeholder="Minimum 6 characters" 
                />
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-600 dark:text-slate-400 transition-colors">Re-verify Password</label>
                <input 
                  type="password" 
                  value={passwordData.confirmPassword} 
                  onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})} 
                  className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-500 text-sm font-bold bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 transition-colors" 
                  placeholder="Type signature again" 
                />
              </div>

              <div className="sm:col-span-2 flex justify-end mt-1">
                <button 
                  type="submit" 
                  disabled={passLoading}
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-md shadow-orange-100 dark:shadow-none transition-all flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
                >
                  {passLoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  Commit Credential Signature
                </button>
              </div>
            </form>
          </div>
        </div>
        {/* Account Management – Danger Zone */}
        <div className="border-t border-gray-100 dark:border-slate-800/50 pt-6">
          <div className="bg-red-50/60 dark:bg-red-950/20 p-5 rounded-2xl border border-red-200 dark:border-red-900/40 flex flex-col gap-4 transition-colors">
            <div>
              <h3 className="font-bold text-sm text-gray-800 dark:text-slate-200 flex items-center gap-2 transition-colors">
                <AlertTriangle size={16} className="text-red-600 dark:text-red-400" /> Account Management
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium mt-0.5">
                Danger zone — these actions affect all your data and require admin approval.
              </p>
            </div>

            {/* Pending request banner */}
            {existingRequest && (
              <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center gap-3 ${
                existingRequest.request_type === 'delete'
                  ? 'bg-red-100 dark:bg-red-950/40 border-red-300 dark:border-red-800'
                  : 'bg-orange-100 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800'
              }`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-bold text-gray-800 dark:text-slate-100 text-sm">
                    <Clock size={14} className={existingRequest.request_type === 'delete' ? 'text-red-500' : 'text-orange-500'} />
                    Pending {existingRequest.request_type === 'delete' ? 'Delete' : 'Reset'} Request
                  </div>
                  <p className="text-xs text-gray-600 dark:text-slate-400 mt-0.5 font-medium">
                    {existingRequest.reason} &nbsp;·&nbsp;
                    <span className="font-bold">{getExpiryCountdown(existingRequest.expires_at)}</span>
                  </p>
                </div>
                <button
                  onClick={handleCancelRequest}
                  disabled={cancelReqLoading}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-gray-50 dark:hover:bg-slate-700 transition-all active:scale-95 disabled:opacity-60"
                >
                  {cancelReqLoading ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                  Cancel Request
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              {/* Reset Account */}
              <div className="flex-1 bg-white dark:bg-slate-900/50 p-4 rounded-xl border border-orange-200 dark:border-orange-900/40 flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-orange-100 dark:bg-orange-950/40 rounded-lg text-orange-600 dark:text-orange-400">
                    <RefreshCcw size={16} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 dark:text-slate-100 text-xs">Reset Account</h4>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">Wipes bills, orders &amp; stock. Profile stays.</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowResetModal(true)}
                  disabled={!!existingRequest}
                  className="w-full py-2 bg-orange-100 dark:bg-orange-950/30 hover:bg-orange-200 dark:hover:bg-orange-950/50 text-orange-700 dark:text-orange-400 font-bold rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshCcw size={13} /> Request Reset
                </button>
              </div>

              {/* Delete Account */}
              <div className="flex-1 bg-white dark:bg-slate-900/50 p-4 rounded-xl border border-red-200 dark:border-red-900/40 flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-red-100 dark:bg-red-950/40 rounded-lg text-red-600 dark:text-red-400">
                    <Trash2 size={16} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 dark:text-slate-100 text-xs">Delete Account</h4>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">Permanently removes all data. Irreversible.</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  disabled={!!existingRequest}
                  className="w-full py-2 bg-red-100 dark:bg-red-950/30 hover:bg-red-200 dark:hover:bg-red-950/50 text-red-700 dark:text-red-400 font-bold rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 size={13} /> Request Deletion
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/50 rounded-3xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-100 dark:bg-red-950/50 rounded-2xl text-red-600 dark:text-red-400 shrink-0">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-slate-100">Delete Account</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400 font-medium mt-1">
                  This will permanently delete <strong>ALL</strong> your data — bills, menu, stock, customers, and your account. <strong className="text-red-600 dark:text-red-400">This cannot be undone.</strong>
                </p>
              </div>
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-3.5 border border-red-200 dark:border-red-900/40">
              <p className="text-xs font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle size={13} />
                Admin will review. If not rejected within 24 hours, deletion happens automatically.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-700 dark:text-slate-300">Reason <span className="text-red-500">*</span></label>
              <textarea
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                rows={3}
                placeholder="Why do you want to delete your account?"
                className="px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 text-sm font-medium resize-none focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeleteReason(''); }} className="flex-1 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-xl font-bold text-sm transition-all">
                Cancel
              </button>
              <button onClick={handleDeleteRequest} disabled={acctReqLoading || !deleteReason.trim()} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
                {acctReqLoading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Account Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-900/50 rounded-3xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-orange-100 dark:bg-orange-950/50 rounded-2xl text-orange-600 dark:text-orange-400 shrink-0">
                <RefreshCcw size={22} />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-slate-100">Reset Account</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400 font-medium mt-1">
                  This will wipe all <strong>bills, orders, stock, and customers</strong>. Your profile, menu, and subscription will remain intact.
                </p>
              </div>
            </div>
            <div className="bg-orange-50 dark:bg-orange-950/30 rounded-xl p-3.5 border border-orange-200 dark:border-orange-900/40">
              <p className="text-xs font-bold text-orange-700 dark:text-orange-400 flex items-center gap-2">
                <AlertTriangle size={13} />
                Admin will review. If not rejected within 24 hours, reset happens automatically.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-700 dark:text-slate-300">Reason <span className="text-orange-500">*</span></label>
              <textarea
                value={resetReason}
                onChange={e => setResetReason(e.target.value)}
                rows={3}
                placeholder="Why do you want to reset your account?"
                className="px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 text-sm font-medium resize-none focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowResetModal(false); setResetReason(''); }} className="flex-1 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-xl font-bold text-sm transition-all">
                Cancel
              </button>
              <button onClick={handleResetRequest} disabled={acctReqLoading || !resetReason.trim()} className="flex-1 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
                {acctReqLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
