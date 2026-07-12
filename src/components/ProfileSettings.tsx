import { useState, useEffect } from 'react';
import { useLiveQuery } from '../db';
import { db } from '../db';
import { Store, Phone, Mail, MapPin, FileText, Percent, Save, Image as ImageIcon, RotateCcw, Lock, ShieldCheck, Loader2, Trash2, RefreshCcw, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { supabase } from '../supabase';
import { useToast } from './Toast';
import ConfirmModal from './ConfirmModal';

export default function ProfileSettings() {
  const { showToast } = useToast();
  const globalSettings = useLiveQuery(async () => {
    const profile = await db.restaurantProfile.get('global');
    const sys = await db.restaurantSettings.get('global');
    return { ...(profile || {}), ...(sys || {}) };
  }, [], ['restaurant_profile', 'restaurant_settings']);
  
  const [formData, setFormData] = useState({
    restaurantName: 'Restaurant POS',
    phone: '',
    email: '',
    address: '',
    gstNumber: '',
    fssaiNumber: '',
    gstPercentage: '5'
  });

  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [passLoading, setPassLoading] = useState(false);
  const [showResetBillConfirm, setShowResetBillConfirm] = useState(false);

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

  const handleResetBillSequence = async () => {
    try {
      const existingSettings = await db.restaurantSettings.get('global') || { id: 'global' };
      await db.restaurantSettings.put({ ...existingSettings, billSequence: 1 } as any);
      showToast('Bill number reset to 1 successfully', 'success');
    } catch (err) {
      showToast('Failed to reset bill number', 'error');
    }
    setShowResetBillConfirm(false);
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
    if (!deleteReason.trim()) {
      showToast('Please provide a reason for deletion.', 'error');
      return;
    }
    if (!supabase) { showToast('Not connected to cloud.', 'error'); return; }
    setAcctReqLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      // Get restaurant name for admin display
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
      setShowDeleteModal(false);
      setDeleteReason('');
      fetchExistingRequest();
    } catch (err: any) {
      showToast('Failed to submit request: ' + err.message, 'error');
    } finally {
      setAcctReqLoading(false);
    }
  };

  const handleResetRequest = async () => {
    if (!resetReason.trim()) {
      showToast('Please provide a reason for account reset.', 'error');
      return;
    }
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
      setShowResetModal(false);
      setResetReason('');
      fetchExistingRequest();
    } catch (err: any) {
      showToast('Failed to submit request: ' + err.message, 'error');
    } finally {
      setAcctReqLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!existingRequest || !supabase) return;
    setCancelReqLoading(true);
    try {
      const { error } = await supabase
        .from('account_requests')
        .update({ status: 'cancelled' })
        .eq('id', existingRequest.id);
      if (error) throw error;
      showToast('Request cancelled successfully.', 'success');
      setExistingRequest(null);
    } catch (err: any) {
      showToast('Failed to cancel request: ' + err.message, 'error');
    } finally {
      setCancelReqLoading(false);
    }
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
        gstPercentage: globalSettings.gstPercentage?.toString() || '5'
      });
    }
  }, [globalSettings]);

  // Fetch existing request on mount
  useEffect(() => { fetchExistingRequest(); }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    try {
      const gstRate = Number(formData.gstPercentage);
      if (isNaN(gstRate) || gstRate < 0 || gstRate > 100) {
        showToast('GST Percentage must be a valid number between 0 and 100.', 'error');
        return;
      }

      const existingProfile = await db.restaurantProfile.get('global') || { id: 'global' };
      const existingSettings = await db.restaurantSettings.get('global') || { id: 'global' };

      await db.restaurantProfile.put({
        ...existingProfile,
        id: 'global',
        restaurantName: formData.restaurantName,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        gstNumber: formData.gstNumber,
        fssaiNumber: formData.fssaiNumber,
      } as any);

      await db.restaurantSettings.put({
        ...existingSettings,
        id: 'global',
        gstPercentage: gstRate,
      } as any);

      showToast('Restaurant Profile Updated Successfully!', 'success');
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
      showToast('Password updated successfully!', 'success');
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
    <div className="h-full flex flex-col gap-6 overflow-auto max-w-4xl mx-auto w-full transition-colors">
      <div className="flex items-center justify-between glass-card-solid p-6 rounded-3xl shadow-sm transition-colors">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-100 dark:bg-indigo-950/40 p-3 rounded-2xl text-indigo-600 dark:text-indigo-400 transition-colors">
            <Store size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800 dark:text-slate-100 transition-colors">Restaurant Profile</h1>
            <p className="text-gray-500 dark:text-slate-400 font-medium transition-colors">Update your business details, tax, and address for billing.</p>
          </div>
        </div>
        <button 
          onClick={handleSave}
          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center gap-2 active:scale-95"
        >
          <Save size={20} />
          Save Changes
        </button>
      </div>

      <div className="glass-card-solid rounded-3xl shadow-sm p-8 flex flex-col gap-8 transition-colors">
        
        {/* Basic Info */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-4 border-b border-gray-200 dark:border-slate-800/50 pb-2 transition-colors">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-600 dark:text-slate-400 flex items-center gap-2 transition-colors"><Store size={16}/> Restaurant Name</label>
              <input type="text" name="restaurantName" value={formData.restaurantName} onChange={handleChange} className="input-premium text-base" placeholder="Restaurant Name" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-600 dark:text-slate-400 flex items-center gap-2 transition-colors"><Phone size={16}/> Mobile Number</label>
              <input type="text" name="phone" value={formData.phone} onChange={handleChange} className="input-premium text-base" placeholder="+91 9876543210" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-600 dark:text-slate-400 flex items-center gap-2 transition-colors"><Mail size={16}/> Email Address</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} className="input-premium text-base" placeholder="hello@restaurant.com" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-600 dark:text-slate-400 flex items-center gap-2 transition-colors"><ImageIcon size={16}/> Logo URL (Optional)</label>
              <input type="text" disabled className="px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none bg-gray-50 dark:bg-slate-800/50 font-medium text-gray-400 dark:text-slate-500 cursor-not-allowed transition-colors text-base" placeholder="Logo upload coming soon..." />
            </div>
          </div>
        </div>

        {/* Security & Password */}
        <div className="bg-orange-50/50 dark:bg-orange-950/20 p-6 rounded-2xl border border-orange-100 dark:border-orange-900/40 transition-colors">
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-4 border-b border-orange-200 dark:border-orange-900/40 pb-2 flex items-center gap-2 transition-colors">
            <Lock size={20} className="text-orange-600 dark:text-orange-400" /> Security & Password
          </h2>
          <form onSubmit={handlePasswordChange} className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-600 dark:text-slate-400 transition-colors">New Password</label>
              <input 
                type="password" 
                value={passwordData.newPassword} 
                onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})} 
                className="px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-500 font-medium bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 transition-colors text-base" 
                placeholder="At least 6 chars" 
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-600 dark:text-slate-400 transition-colors">Confirm New Password</label>
              <input 
                type="password" 
                value={passwordData.confirmPassword} 
                onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})} 
                className="px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-500 font-medium bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 transition-colors text-base" 
                placeholder="Re-type password" 
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button 
                type="submit" 
                disabled={passLoading}
                className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold shadow-lg shadow-orange-200 dark:shadow-none transition-all flex items-center gap-2 disabled:opacity-70 active:scale-95"
              >
                {passLoading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                Update Password
              </button>
            </div>
          </form>
        </div>

        {/* Location */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-4 border-b border-gray-200 dark:border-slate-800/50 pb-2 transition-colors">Location & Address</h2>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-gray-600 dark:text-slate-400 flex items-center gap-2 transition-colors"><MapPin size={16}/> Full Address</label>
            <textarea name="address" value={formData.address} onChange={handleChange} rows={3} className="px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500 font-medium resize-none bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 transition-colors text-base" placeholder="123 Food Street, Culinary District, City - 400001"></textarea>
          </div>
        </div>

        {/* Legal & Tax */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-4 border-b border-gray-200 dark:border-slate-800/50 pb-2 transition-colors">Legal & Taxation</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-600 dark:text-slate-400 flex items-center gap-2 transition-colors"><FileText size={16}/> FSSAI Number</label>
              <input type="text" name="fssaiNumber" value={formData.fssaiNumber} onChange={handleChange} className="input-premium text-base" placeholder="11512345000123" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-600 dark:text-slate-400 flex items-center gap-2 transition-colors"><FileText size={16}/> GST Number</label>
              <input type="text" name="gstNumber" value={formData.gstNumber} onChange={handleChange} className="input-premium text-base" placeholder="27ABCDE1234F1Z5" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-600 dark:text-slate-400 flex items-center gap-2 transition-colors"><Percent size={16}/> Default Tax (GST %)</label>
              <input type="number" name="gstPercentage" value={formData.gstPercentage} onChange={handleChange} className="input-premium text-base" placeholder="5" />
            </div>
          </div>
        </div>

        {/* Billing & Sequence */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-4 border-b border-gray-200 dark:border-slate-800/50 pb-2 transition-colors">Billing & Sequence</h2>
          <div className="flex flex-col sm:flex-row items-center gap-4 bg-gray-50 dark:bg-slate-900/40 p-5 rounded-2xl border border-gray-200 dark:border-slate-800/60 transition-colors">
             <div className="flex-1 text-center sm:text-left">
                <h3 className="font-bold text-gray-800 dark:text-slate-200 flex items-center justify-center sm:justify-start gap-2 transition-colors">
                  Current Bill Sequence: <span className="text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-950/40 px-3 py-1 rounded-lg transition-colors">#{globalSettings?.billSequence || 1}</span>
                </h3>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-2 font-medium transition-colors">The next generated bill will use this number. Resetting will start the next bill from #1.</p>
             </div>
             <button 
                onClick={() => setShowResetBillConfirm(true)}
                className="w-full sm:w-auto px-6 py-3 bg-red-100 dark:bg-red-950/30 hover:bg-red-200 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 font-bold rounded-xl transition-all shadow-sm dark:shadow-none flex items-center justify-center gap-2 active:scale-95"
             >
                <RotateCcw size={18} />
                Reset Bill Number
             </button>
          </div>
        </div>

        {/* Account Management – Danger Zone */}
        <div className="bg-red-50/60 dark:bg-red-950/20 p-6 rounded-2xl border border-red-200 dark:border-red-900/40 transition-colors">
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-1 flex items-center gap-2 transition-colors">
            <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
            Account Management
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-5 font-medium">
            Danger zone — these actions affect all your data and require admin approval.
          </p>

          {/* Existing pending request banner */}
          {existingRequest && (
            <div className={`mb-5 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center gap-3 ${
              existingRequest.request_type === 'delete'
                ? 'bg-red-100 dark:bg-red-950/40 border-red-300 dark:border-red-800'
                : 'bg-orange-100 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800'
            }`}>
              <div className="flex-1">
                <div className="flex items-center gap-2 font-bold text-gray-800 dark:text-slate-100">
                  <Clock size={16} className={existingRequest.request_type === 'delete' ? 'text-red-500' : 'text-orange-500'} />
                  Pending {existingRequest.request_type === 'delete' ? 'Delete' : 'Reset'} Request
                </div>
                <p className="text-xs text-gray-600 dark:text-slate-400 mt-1 font-medium">
                  Reason: {existingRequest.reason} &nbsp;|&nbsp;
                  <span className="font-bold">{getExpiryCountdown(existingRequest.expires_at)}</span>
                </p>
              </div>
              <button
                onClick={handleCancelRequest}
                disabled={cancelReqLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-xl text-sm font-bold hover:bg-gray-50 dark:hover:bg-slate-700 transition-all active:scale-95 disabled:opacity-60"
              >
                {cancelReqLoading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Cancel Request
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4">
            {/* Reset Account */}
            <div className="flex-1 bg-white dark:bg-slate-900/50 p-5 rounded-xl border border-orange-200 dark:border-orange-900/40 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-100 dark:bg-orange-950/40 rounded-xl text-orange-600 dark:text-orange-400">
                  <RefreshCcw size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-slate-100 text-sm">Reset Account</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Wipes bills, orders & stock. Profile stays.</p>
                </div>
              </div>
              <button
                onClick={() => setShowResetModal(true)}
                disabled={!!existingRequest}
                className="w-full py-2.5 bg-orange-100 dark:bg-orange-950/30 hover:bg-orange-200 dark:hover:bg-orange-950/50 text-orange-700 dark:text-orange-400 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCcw size={15} />
                Request Reset
              </button>
            </div>

            {/* Delete Account */}
            <div className="flex-1 bg-white dark:bg-slate-900/50 p-5 rounded-xl border border-red-200 dark:border-red-900/40 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-red-100 dark:bg-red-950/40 rounded-xl text-red-600 dark:text-red-400">
                  <Trash2 size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-slate-100 text-sm">Delete Account</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Permanently removes all data. Irreversible.</p>
                </div>
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                disabled={!!existingRequest}
                className="w-full py-2.5 bg-red-100 dark:bg-red-950/30 hover:bg-red-200 dark:hover:bg-red-950/50 text-red-700 dark:text-red-400 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 size={15} />
                Request Deletion
              </button>
            </div>
          </div>
        </div>
      </div>

      {showResetBillConfirm && (
        <ConfirmModal
          isOpen={showResetBillConfirm}
          title="Reset Bill Number"
          message="Are you sure you want to reset the bill number sequence to 1? This cannot be undone."
          onConfirm={handleResetBillSequence}
          onCancel={() => setShowResetBillConfirm(false)}
        />
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/50 rounded-3xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-100 dark:bg-red-950/50 rounded-2xl text-red-600 dark:text-red-400 shrink-0">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-slate-100">Delete Account</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400 font-medium mt-1">
                  This will permanently delete <strong>ALL</strong> your data — bills, menu, stock, customers, settings, and your account itself. <strong className="text-red-600 dark:text-red-400">This cannot be undone.</strong>
                </p>
              </div>
            </div>

            <div className="bg-red-50 dark:bg-red-950/30 rounded-2xl p-4 border border-red-200 dark:border-red-900/40">
              <p className="text-xs font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle size={14} />
                Your request will be reviewed by admin. If not rejected within 24 hours, deletion will happen automatically.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-700 dark:text-slate-300">Reason for deletion <span className="text-red-500">*</span></label>
              <textarea
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                rows={3}
                placeholder="Please explain why you want to delete your account..."
                className="px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 text-sm font-medium resize-none focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteReason(''); }}
                className="flex-1 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRequest}
                disabled={acctReqLoading || !deleteReason.trim()}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
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
                <RefreshCcw size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-slate-100">Reset Account</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400 font-medium mt-1">
                  This will wipe all <strong>bills, orders, stock, and customers</strong>. Your restaurant profile, menu items, and subscription will remain intact.
                </p>
              </div>
            </div>

            <div className="bg-orange-50 dark:bg-orange-950/30 rounded-2xl p-4 border border-orange-200 dark:border-orange-900/40">
              <p className="text-xs font-bold text-orange-700 dark:text-orange-400 flex items-center gap-2">
                <AlertTriangle size={14} />
                Your request will be reviewed by admin. If not rejected within 24 hours, reset will happen automatically.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-700 dark:text-slate-300">Reason for reset <span className="text-orange-500">*</span></label>
              <textarea
                value={resetReason}
                onChange={e => setResetReason(e.target.value)}
                rows={3}
                placeholder="Please explain why you want to reset your account data..."
                className="px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 text-sm font-medium resize-none focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowResetModal(false); setResetReason(''); }}
                className="flex-1 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleResetRequest}
                disabled={acctReqLoading || !resetReason.trim()}
                className="flex-1 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
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
