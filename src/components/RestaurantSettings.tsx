import { useState, useEffect, useRef } from 'react';
import { useLiveQuery, db, exportDbToJson } from '../db';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Settings, 
  Save, 
  Printer, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Cpu, 
  Layers, 
  Layout, 
  ShieldCheck,
  Phone,
  Mail,
  MapPin,
  Award,
  FileText,
  Heart,
  QrCode,
  Cloud,
  Database,
  Store,
  Percent,
  MessageSquare,
  Copy,
  Check,
  Lock,
  Loader2,
  Smartphone,
  Sparkles,
  Trash2,
  RefreshCcw,
  AlertTriangle,
  XCircle,
  Clock
} from 'lucide-react';
import { ThermalPrinter } from '../printer';
import { useToast } from './Toast';
import { usePremium } from '../hooks/usePremium';
import { useApp } from '../contexts/AppContext';
import { supabase } from '../supabase';

// Access securely exposed electronAPI from preload script
const electronAPI = (window as any).electronAPI;

interface SubTabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
}

function SubTabButton({ active, onClick, icon, label, badge }: SubTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between text-left py-2.5 px-3 rounded-xl transition-all duration-300 select-none md:w-full shrink-0 gap-2 border outline-none cursor-pointer text-xs font-black hover:translate-x-0.5 ${
        active
          ? 'bg-gradient-to-r from-indigo-500/10 via-purple-500/[0.03] to-transparent border-l-4 border-indigo-600 dark:border-indigo-500 border-t-transparent border-r-transparent border-b-transparent text-indigo-950 dark:text-indigo-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
          : 'bg-transparent border-transparent hover:bg-gray-50/70 dark:hover:bg-slate-800/35 text-gray-550 dark:text-slate-450 hover:text-gray-800 dark:hover:text-slate-200'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className={`p-1.5 rounded-lg transition-all duration-300 shrink-0 ${
          active 
            ? 'bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20' 
            : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-450'
        }`}>
          {icon}
        </div>
        <span className="hidden md:inline leading-none font-bold text-[11px] tracking-tight">{label}</span>
      </div>
      {badge && <div className="hidden md:block shrink-0">{badge}</div>}
    </button>
  );
}

const getPublicOrderingUrl = (restaurantCode: string | undefined, tableId?: string | number) => {
  if (!restaurantCode) return '';
  const siteUrl = import.meta.env.VITE_SITE_URL || 'https://www.siyabill.in';
  let baseOrigin = window.location.origin;
  if (baseOrigin.startsWith('app://') || baseOrigin.startsWith('file://') || baseOrigin.includes('localhost')) {
    baseOrigin = siteUrl;
  }
  return tableId 
    ? `${baseOrigin}/?r=${restaurantCode}&t=${tableId}`
    : `${baseOrigin}/?r=${restaurantCode}`;
};

export default function RestaurantSettings() {
  const premiumState = usePremium();
  const { categoryLayout: currentLayout, setCategoryLayout } = useApp();
  const { showToast } = useToast();
  
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'general' | 'printer' | 'whatsapp' | 'updates' | 'qr_generator'>('profile');

  const globalSettings = useLiveQuery(async () => {
    const profile = await db.restaurantProfile.get('global');
    const sys = await db.restaurantSettings.get('global');
    return { ...(profile || {}), ...(sys || {}) };
  }, [], ['restaurant_profile', 'restaurant_settings']);
  const tables = useLiveQuery(() => db.activeOrders.toArray(), [], 'active_orders') || [];


  const [formData, setFormData] = useState({
    printPhone: true,
    printEmail: true,
    printAddress: true,
    printFssai: true,
    printGst: true,
    printThankYou: true,
    printQrCode: true,
    baudRate: 9600,
    printerWidth: 32,
    printerMode: 'single',
    categoryLayout: 'sidebar',
    billLanguage: 'en',
    onlineDeliveryEnabled: true,
    onlineTakeawayEnabled: true
  });

  const [appVersion, setAppVersion] = useState(import.meta.env.VITE_APP_VERSION || '3.4.6');

  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  const [printerStatus, setPrinterStatus] = useState({
    generic: false,
    receipt: false,
    kot: false,
    bar: false
  });

  const [enableCloudPrintSending, setEnableCloudPrintSending] = useState(
    localStorage.getItem('enableCloudPrintSending') !== 'false'
  );
  const [enableCloudPrintReceiving, setEnableCloudPrintReceiving] = useState(
    localStorage.getItem('enableCloudPrintReceiving') !== 'false'
  );

  const [printerConnectionType, setPrinterConnectionType] = useState(
    localStorage.getItem('printerConnectionType') || 'serial'
  );

  const [updateStatus, setUpdateStatus] = useState<{
    type: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
    message: string;
    progress?: number;
    releaseNotes?: string | any[];
  }>({ type: 'idle', message: '' });

  const progressRef = useRef<HTMLDivElement>(null);

  // ── Profile State ────────────────────────────────────────────────────────
  const [profileFormData, setProfileFormData] = useState({
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

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement;
    if (target.type === 'checkbox') {
      setProfileFormData({ ...profileFormData, [target.name]: target.checked });
    } else {
      setProfileFormData({ ...profileFormData, [target.name]: target.value });
    }
  };

  const handleProfileSave = async () => {
    try {
      await db.restaurantProfile.put({
        ...(globalSettings || {}),
        id: 'global',
        restaurantName: profileFormData.restaurantName,
        phone: profileFormData.phone,
        email: profileFormData.email,
        address: profileFormData.address,
        gstNumber: profileFormData.gstNumber,
        fssaiNumber: profileFormData.fssaiNumber,
        gstPercentage: Number(profileFormData.gstPercentage) || 0,
        thankYouMessage: profileFormData.thankYouMessage,
        upiId: profileFormData.upiId,
        upiEnabled: profileFormData.upiEnabled
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

  // Poll printer connection states
  const checkPrinters = () => {
    setPrinterStatus({
      generic: ThermalPrinter.isConnected,
      receipt: ThermalPrinter.isReceiptConnected,
      kot: ThermalPrinter.isKOTConnected,
      bar: ThermalPrinter.isBarConnected
    });
  };

  useEffect(() => {
    checkPrinters();
    const interval = setInterval(checkPrinters, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progressRef.current && updateStatus.type === 'downloading') {
      progressRef.current.style.width = `${updateStatus.progress || 0}%`;
    }
  }, [updateStatus.progress, updateStatus.type]);

  useEffect(() => {
    const fetchVersion = async () => {
      if (electronAPI) {
        const version = await electronAPI.getAppVersion();
        setAppVersion(version);
      }
    };
    fetchVersion();
  }, []);

  useEffect(() => {
    if (globalSettings) {
      setFormData({
        printPhone: globalSettings.printPhone !== false,
        printEmail: globalSettings.printEmail !== false,
        printAddress: globalSettings.printAddress !== false,
        printFssai: globalSettings.printFssai !== false,
        printGst: globalSettings.printGst !== false,
        printThankYou: globalSettings.printThankYou !== false,
        printQrCode: globalSettings.printQrCode !== false,
        baudRate: globalSettings.baudRate || 9600,
        printerWidth: globalSettings.printerWidth || 32,
        printerMode: globalSettings.printerMode || 'single',
        categoryLayout: currentLayout,
        billLanguage: localStorage.getItem('billLanguage') || globalSettings.billLanguage || 'en',
        onlineDeliveryEnabled: globalSettings.onlineDeliveryEnabled !== false,
        onlineTakeawayEnabled: globalSettings.onlineTakeawayEnabled !== false
      });
      setProfileFormData({
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
  }, [globalSettings, currentLayout]);

  // Fetch existing pending request on mount
  useEffect(() => { fetchExistingRequest(); }, []);


  useEffect(() => {
    if (!electronAPI) return;

    electronAPI.onUpdateChecking(() => setUpdateStatus(prev => ({ ...prev, type: 'checking', message: 'Checking for updates...' })));
    electronAPI.onUpdateAvailable((_: any, info: any) => setUpdateStatus(prev => ({ 
      ...prev, 
      type: 'available', 
      message: `Update v${info.version} available. Downloading...`,
      releaseNotes: info.releaseNotes
    })));
    electronAPI.onUpdateNotAvailable(() => setUpdateStatus(prev => ({ ...prev, type: 'not-available', message: 'App is up to date.' })));
    electronAPI.onUpdateDownloadProgress((_: any, progress: any) => setUpdateStatus(prev => ({ 
      ...prev,
      type: 'downloading', 
      message: `Downloading: ${Math.round(progress.percent)}%`,
      progress: progress.percent 
    })));
    electronAPI.onUpdateDownloaded((_: any, info: any) => setUpdateStatus(prev => ({ 
      ...prev,
      type: 'downloaded', 
      message: `Version ${info.version} downloaded. Restart to apply.`,
      releaseNotes: info.releaseNotes || prev.releaseNotes
    })));
    electronAPI.onUpdateError((_: any, err: string) => setUpdateStatus(prev => ({ ...prev, type: 'error', message: `Update Error: ${err}` })));

    return () => {
      ['update-checking', 'update-available', 'update-not-available', 'update-download-progress', 'update-downloaded', 'update-error'].forEach(channel => {
        electronAPI.removeListeners(channel);
      });
    };
  }, []);

  useEffect(() => {
    if (globalSettings !== undefined) return;
    const t = setTimeout(() => setLoadingTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, [globalSettings]);

  const handleCheckUpdates = () => {
    if (electronAPI) {
      electronAPI.checkForUpdates();
    } else {
      showToast('Update check is only available in the installed application.', 'info');
    }
  };
  const handlePrintQR = async (tableId: number) => {
    const restaurantCode = globalSettings?.restaurantCode || '';
    if (!restaurantCode) {
      showToast('Please set your Restaurant Code in Profile Settings first.', 'error');
      return;
    }
    const orderUrl = getPublicOrderingUrl(restaurantCode, tableId);
    
    try {
      const QRCode = (await import('qrcode')).default;
      const qrDataUrl = await QRCode.toDataURL(orderUrl, { margin: 1, width: 250 });
      
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      printWindow.document.write(`
        <html>
          <head>
            <title>Print QR Code - Table ${tableId}</title>
            <style>
              body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                text-align: center;
                padding: 40px;
                color: #333;
              }
              .card {
                border: 3px solid #f97316;
                border-radius: 24px;
                padding: 40px 20px;
                max-width: 320px;
                margin: 0 auto;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
              }
              h1 {
                font-size: 26px;
                font-weight: 900;
                margin: 0 0 5px 0;
                color: #1e293b;
              }
              .sub {
                font-size: 16px;
                font-weight: 800;
                color: #f97316;
                text-transform: uppercase;
                letter-spacing: 2px;
                margin-bottom: 25px;
              }
              .qr-container {
                background: #fff;
                padding: 15px;
                display: inline-block;
                border-radius: 16px;
                border: 1px solid #e2e8f0;
                margin-bottom: 25px;
              }
              .instructions {
                font-size: 14px;
                font-weight: 800;
                color: #475569;
                margin-bottom: 5px;
              }
              .url {
                font-size: 10px;
                font-weight: 600;
                color: #94a3b8;
                word-break: break-all;
              }
              @media print {
                body { padding: 0; }
                .card { box-shadow: none; border-color: #000; }
              }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>${(globalSettings?.restaurantName || 'SIYA BILL').toUpperCase()}</h1>
              <div class="sub">Table ${tableId}</div>
              <div class="qr-container">
                <img src="${qrDataUrl}" width="200" height="200" alt="QR Code" />
              </div>
              <div class="instructions">Scan QR Code to Order Online</div>
              <div class="url">${orderUrl}</div>
            </div>
            <script>
              setTimeout(() => { window.print(); window.close(); }, 500);
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      console.error('Failed to generate QR Code:', err);
      showToast('Failed to generate QR Code.', 'error');
    }
  };



  const handleToggle = (name: keyof typeof formData) => {
    setFormData({ ...formData, [name]: !formData[name] });
  };

  const [savingSettings, setSavingSettings] = useState(false);

  const handleSave = async () => {
    if (savingSettings) return;
    setSavingSettings(true);
    try {
      const existingSettings = (await db.restaurantSettings.get('global') || {}) as any;

      await db.restaurantSettings.put({
        ...existingSettings,
        id: 'global',
        printPhone: formData.printPhone,
        printEmail: formData.printEmail,
        printAddress: formData.printAddress,
        printFssai: formData.printFssai,
        printGst: formData.printGst,
        printThankYou: formData.printThankYou,
        printQrCode: formData.printQrCode,
        baudRate: Number(formData.baudRate),
        printerWidth: Number(formData.printerWidth),
        printerMode: formData.printerMode as 'single' | 'multiple',
        categoryLayout: formData.categoryLayout as 'top' | 'sidebar',
        billLanguage: formData.billLanguage,
        onlineDeliveryEnabled: formData.onlineDeliveryEnabled,
        onlineTakeawayEnabled: formData.onlineTakeawayEnabled,
        gstPercentage: existingSettings.gstPercentage || 5
      } as any);

      localStorage.setItem('billLanguage', formData.billLanguage);

      setCategoryLayout(formData.categoryLayout as 'top' | 'sidebar');
      showToast('Restaurant Settings Updated Successfully!', 'success');
      checkPrinters();
    } catch (err: any) {
      console.error('Error saving settings:', err);
      showToast(`Error saving settings: ${err.message || err}`, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  if (globalSettings === undefined && !loadingTimedOut) return (
    <div className="h-full flex items-center justify-center bg-[#f8f9fa] dark:bg-[#0b0f19]">
       <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-gray-500 dark:text-slate-400 font-bold text-lg">Loading Settings...</div>
       </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#0f172a] rounded-3xl border border-gray-150 dark:border-slate-800/80 shadow-sm overflow-hidden w-full transition-colors relative">
      
      {/* Header bar — compact */}
      <div className="relative overflow-hidden px-5 py-3.5 border-b border-gray-100 dark:border-slate-850/60 bg-gradient-to-r from-slate-50/50 via-white to-slate-50/30 dark:from-slate-900/40 dark:via-[#1e293b]/20 dark:to-slate-900/30 shrink-0">
        <div className="absolute top-0 right-1/4 w-72 h-72 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 p-2 rounded-xl text-white shadow-md shadow-indigo-500/10 shrink-0">
              {activeSubTab === 'profile' ? <Store size={18} /> : <Settings size={18} className="animate-spin-slow" />}
            </div>
            <div>
              <h1 className="text-base font-black text-gray-800 dark:text-slate-100 tracking-tight leading-tight">
                Settings & Profile
              </h1>
              <p className="text-gray-450 dark:text-slate-550 text-[9px] font-bold mt-0.5 tracking-wider uppercase flex items-center gap-1.5 leading-none">
                v{appVersion} <span className="text-gray-300 dark:text-slate-700">•</span> <span>{activeSubTab === 'profile' ? 'Restaurant Profile' : activeSubTab === 'general' ? 'General & Layout' : activeSubTab === 'printer' ? 'Printer Setup' : activeSubTab === 'qr_generator' ? 'QR Generator' : 'App Updates'}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={activeSubTab === 'profile' ? handleProfileSave : handleSave}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold shadow-md shadow-indigo-500/15 hover:shadow-indigo-500/25 transition-all duration-200 flex items-center gap-2 text-xs shrink-0 active:scale-95 cursor-pointer border border-indigo-500/20"
          >
            <Save size={13} />
            {activeSubTab === 'profile' ? 'Save Profile' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Two-Pane Navigation Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        
        {/* Left compact sidebar */}
        <div className="w-full md:w-44 bg-slate-50/50 dark:bg-slate-900/10 border-b md:border-b-0 md:border-r border-gray-100 dark:border-slate-800/60 p-2 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-y-auto shrink-0 scrollbar-hide md:pr-1.5 min-w-0">
          <SubTabButton
            active={activeSubTab === 'profile'}
            onClick={() => setActiveSubTab('profile')}
            icon={<Store size={15} />}
            label="Restaurant Profile"
            badge={null}
          />
          <SubTabButton
            active={activeSubTab === 'general'}
            onClick={() => setActiveSubTab('general')}
            icon={<Layout size={15} />}
            label="General & Layout"
            badge={null}
          />
          <SubTabButton
            active={activeSubTab === 'printer'}
            onClick={() => setActiveSubTab('printer')}
            icon={<Printer size={15} />}
            label="Printer Setup"
            badge={
              (printerStatus.generic || printerStatus.receipt || printerStatus.kot || printerStatus.bar) ? (
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500 animate-[pulse_1s_infinite]"></span>
                </span>
              ) : null
            }
          />

          <SubTabButton
            active={activeSubTab === 'qr_generator'}
            onClick={() => setActiveSubTab('qr_generator')}
            icon={<QrCode size={15} />}
            label="QR Generator"
            badge={null}
          />

          <SubTabButton
            active={activeSubTab === 'updates'}
            onClick={() => setActiveSubTab('updates')}
            icon={<RefreshCw size={15} />}
            label="App Updates"
            badge={
              updateStatus.type === 'available' || updateStatus.type === 'downloaded' ? (
                <span className="text-[8px] font-black uppercase text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full animate-bounce border border-indigo-200/30">New</span>
              ) : null
            }
          />
        </div>

        {/* Right Content Pane */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 min-h-0 bg-white/50 dark:bg-slate-950/10">
          
          {/* TAB 0: RESTAURANT PROFILE */}
          {activeSubTab === 'profile' && (
            <div className="flex flex-col gap-5 animate-fade-in">

              {/* Unique Restaurant Code Card */}
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-4 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-950/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2.5 rounded-xl hidden sm:block">
                    <Smartphone size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-indigo-100 font-bold text-[10px] uppercase tracking-wider mb-0.5">
                      <Sparkles size={10} /> Live Device Access Registry
                    </div>
                    <h2 className="text-sm font-black tracking-tight">Unique App Code</h2>
                    <p className="text-[10px] text-indigo-100 font-medium mt-0.5">Share this code to bind Android waiter terminals.</p>
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

              {/* Basic Info */}
              <div>
                <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-800/50 bg-gray-50 dark:bg-slate-900/40 rounded-t-xl mb-3 transition-colors">
                  <h2 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider transition-colors">Basic Information</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-1">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors">
                      <Store size={14} className="text-indigo-500" /> Restaurant Name
                    </label>
                    <input 
                      type="text" 
                      name="restaurantName" 
                      value={profileFormData.restaurantName} 
                      onChange={handleProfileChange} 
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
                      value={profileFormData.phone} 
                      onChange={handleProfileChange} 
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
                      value={profileFormData.email} 
                      onChange={handleProfileChange} 
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
                      value={profileFormData.address} 
                      onChange={handleProfileChange} 
                      className="input-premium" 
                      placeholder="123 Food Street, City - 400001" 
                    />
                  </div>
                </div>
              </div>

              {/* Legal & Compliance */}
              <div>
                <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-800/50 bg-gray-50 dark:bg-slate-900/40 rounded-t-xl mb-3 transition-colors">
                  <h2 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider transition-colors">Legal Identifiers & Taxes</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-1">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors">
                      <FileText size={14} className="text-indigo-500" /> FSSAI Number
                    </label>
                    <input 
                      type="text" 
                      name="fssaiNumber" 
                      value={profileFormData.fssaiNumber} 
                      onChange={handleProfileChange} 
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
                      value={profileFormData.gstNumber} 
                      onChange={handleProfileChange} 
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
                      value={profileFormData.gstPercentage} 
                      onChange={handleProfileChange} 
                      className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500 font-bold text-indigo-600 dark:text-indigo-400 text-sm bg-indigo-50/30 dark:bg-indigo-950/20 transition-colors" 
                      placeholder="5" 
                    />
                  </div>
                </div>
              </div>

              {/* Receipt Experience & UPI */}
              <div>
                <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-800/50 bg-gray-50 dark:bg-slate-900/40 rounded-t-xl mb-3 transition-colors">
                  <h2 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider transition-colors">Receipt Experience & UPI Payments</h2>
                </div>
                
                <div className="flex flex-col gap-4 px-1">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors">
                      <MessageSquare size={14} className="text-indigo-500" /> Printed Thank You Footer Signature
                    </label>
                    <input 
                      type="text" 
                      name="thankYouMessage" 
                      value={profileFormData.thankYouMessage} 
                      onChange={handleProfileChange} 
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
                          checked={profileFormData.upiEnabled}
                          onChange={handleProfileChange}
                          aria-label="Enable UPI QR code on receipts"
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-slate-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>

                    {profileFormData.upiEnabled && (
                      <div className="flex flex-col gap-1.5 pt-3 border-t border-gray-200 dark:border-slate-700 animate-in fade-in duration-200">
                        <label className="text-xs font-bold text-gray-700 dark:text-slate-300 transition-colors">Store UPI Address (VPA Identifier)</label>
                        <input 
                          type="text" 
                          name="upiId" 
                          value={profileFormData.upiId} 
                          onChange={handleProfileChange} 
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
              <div className="border-t border-gray-100 dark:border-slate-800/50 pt-4">
                <div className="p-4 bg-orange-50 dark:bg-orange-950/20 rounded-2xl border border-orange-100 dark:border-orange-900/40 flex flex-col gap-3 transition-colors">
                  <h3 className="font-bold text-xs text-gray-800 dark:text-slate-200 flex items-center gap-2 transition-colors">
                    <Lock size={14} className="text-orange-600 dark:text-orange-400" /> Admin Security Credential Update
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
              <div className="border-t border-gray-100 dark:border-slate-800/50 pt-4">
                <div className="bg-red-50/60 dark:bg-red-950/20 p-4 rounded-2xl border border-red-200 dark:border-red-900/40 flex flex-col gap-3 transition-colors">
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
          )}

          {/* TAB 1: GENERAL & LAYOUT */}
          {activeSubTab === 'general' && (
            <div className="flex flex-col gap-6 animate-fade-in">
              
              {/* Category Layout Selector */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest leading-none">Category Layout</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
                  
                  {/* Top Tabs */}
                  <div 
                    onClick={() => setFormData({ ...formData, categoryLayout: 'top' })}
                    className={`p-5 rounded-2xl border-2 cursor-pointer transition-all duration-300 flex items-center justify-between select-none shadow-sm ${
                      formData.categoryLayout === 'top'
                        ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                        : 'border-gray-200/60 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl transition-all duration-300 shrink-0 ${formData.categoryLayout === 'top' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'bg-gray-100 dark:bg-slate-800 text-gray-500'}`}>
                        <Layout size={18} className="rotate-180" />
                      </div>
                      <div>
                        <span className="font-extrabold text-xs text-gray-800 dark:text-slate-200 block">Horizontal Tabs (Top)</span>
                        <p className="text-[10px] text-gray-400 dark:text-slate-500 font-bold mt-0.5">Categories displayed as top header buttons.</p>
                      </div>
                    </div>
                    
                    {/* Layout representation */}
                    <div className="flex flex-col gap-1 w-16 h-10 bg-gray-50 dark:bg-slate-950 rounded-lg p-1 border border-gray-200 dark:border-slate-800 shrink-0 ml-2">
                      <div className="flex gap-0.5 border-b border-gray-200 dark:border-slate-850 pb-0.5">
                        <div className={`w-3.5 h-1 rounded-sm ${formData.categoryLayout === 'top' ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-slate-800'}`}></div>
                        <div className="w-3.5 h-1 bg-gray-300 dark:bg-slate-800 rounded-sm"></div>
                        <div className="w-3.5 h-1 bg-gray-300 dark:bg-slate-800 rounded-sm"></div>
                      </div>
                      <div className="grid grid-cols-3 gap-0.5 flex-1">
                        <div className="bg-gray-200 dark:bg-slate-900 rounded-sm"></div>
                        <div className="bg-gray-200 dark:bg-slate-900 rounded-sm"></div>
                        <div className="bg-gray-200 dark:bg-slate-900 rounded-sm"></div>
                      </div>
                    </div>
                  </div>

                  {/* Left Sidebar */}
                  <div 
                    onClick={() => setFormData({ ...formData, categoryLayout: 'sidebar' })}
                    className={`p-5 rounded-2xl border-2 cursor-pointer transition-all duration-300 flex items-center justify-between select-none shadow-sm ${
                      formData.categoryLayout === 'sidebar'
                        ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                        : 'border-gray-200/60 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl transition-all duration-300 shrink-0 ${formData.categoryLayout === 'sidebar' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'bg-gray-100 dark:bg-slate-800 text-gray-500'}`}>
                        <Layout size={18} className="-rotate-90" />
                      </div>
                      <div>
                        <span className="font-extrabold text-xs text-gray-800 dark:text-slate-200 block">Vertical Sidebar (Left)</span>
                        <p className="text-[10px] text-gray-405 dark:text-slate-500 font-bold mt-0.5">Categories listed in a vertical left sidebar pane.</p>
                      </div>
                    </div>

                    {/* Layout representation */}
                    <div className="flex gap-1 w-16 h-10 bg-gray-50 dark:bg-slate-950 rounded-lg p-1 border border-gray-200 dark:border-slate-800 shrink-0 ml-2">
                      <div className="flex flex-col gap-0.5 border-r border-gray-200 dark:border-slate-850 pr-0.5 w-4 shrink-0">
                        <div className={`h-1 w-full rounded-sm ${formData.categoryLayout === 'sidebar' ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-slate-800'}`}></div>
                        <div className="h-1 w-full bg-gray-300 dark:bg-slate-800 rounded-sm"></div>
                        <div className="h-1 w-full bg-gray-300 dark:bg-slate-800 rounded-sm"></div>
                      </div>
                      <div className="grid grid-cols-2 gap-0.5 flex-1">
                        <div className="bg-gray-200 dark:bg-slate-900 rounded-sm"></div>
                        <div className="bg-gray-200 dark:bg-slate-900 rounded-sm"></div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Receipt Toggle Controls Grid */}
              <div className="flex flex-col gap-3.5">
                <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                  <Layers size={12} className="text-indigo-500" />
                  Receipt Printing Settings
                </label>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
                  {[
                    { key: 'printPhone', label: 'Print Phone Number', desc: 'Prints the mobile number on the receipt.', icon: <Phone size={16} /> },
                    { key: 'printEmail', label: 'Print Email Address', desc: 'Prints the store email address on the receipt.', icon: <Mail size={16} /> },
                    { key: 'printAddress', label: 'Print Store Address', desc: 'Prints the restaurant address on the receipt.', icon: <MapPin size={16} /> },
                    { key: 'printFssai', label: 'Print FSSAI Number', desc: 'Prints the FSSAI license number on the receipt.', icon: <Award size={16} /> },
                    { key: 'printGst', label: 'Print GST Number', desc: 'Prints the GSTIN number on the receipt.', icon: <FileText size={16} /> },
                    { key: 'printThankYou', label: 'Print Thank You Footer', desc: 'Prints a thank you message at the bottom of the receipt.', icon: <Heart size={16} /> },
                    { key: 'printQrCode', label: 'Print Payment QR Code', desc: 'Prints a UPI payment QR code on the receipt.', icon: <QrCode size={16} /> }
                  ].map((item) => {
                    const isActive = formData[item.key as keyof typeof formData];
                    return (
                      <div 
                        key={item.key}
                        onClick={() => handleToggle(item.key as keyof typeof formData)}
                        className={`p-4 rounded-2xl border transition-all duration-350 cursor-pointer select-none flex items-center justify-between gap-4 group hover:shadow-md hover:translate-x-0.5 ${
                          isActive 
                            ? 'border-indigo-500/30 bg-gradient-to-tr from-indigo-500/[0.03] to-purple-500/[0.01] dark:from-indigo-500/[0.06] dark:to-purple-500/[0.02] shadow-[0_2px_12px_rgba(99,102,241,0.04)]' 
                            : 'border-gray-150 dark:border-slate-800/80 hover:border-gray-300 dark:hover:border-slate-700 bg-white/40 dark:bg-slate-900/30'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className={`p-2.5 rounded-xl transition-all duration-300 shrink-0 ${
                            isActive 
                              ? 'bg-gradient-to-tr from-indigo-500 to-purple-650 text-white shadow-md shadow-indigo-500/10' 
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 group-hover:bg-gray-200 dark:group-hover:bg-slate-700'
                          }`}>
                            {item.icon}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-black text-gray-805 dark:text-slate-205 tracking-tight leading-none block">{item.label}</span>
                            <p className="text-[10px] text-gray-405 dark:text-slate-500 font-bold leading-normal mt-1.5 truncate">{item.desc}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          title={item.label}
                          className={`w-10 h-6 rounded-full p-1 transition-all duration-300 select-none shrink-0 relative flex items-center ${
                            isActive 
                              ? 'bg-gradient-to-r from-indigo-500 to-purple-600 shadow-[0_0_8px_rgba(99,102,241,0.35)]' 
                              : 'bg-gray-250 dark:bg-slate-800'
                          }`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${
                            isActive ? 'translate-x-4' : 'translate-x-0'
                          }`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>



              {/* Bill Sequence Info */}
              <div className="p-4 bg-gradient-to-r from-amber-500/[0.03] to-orange-500/[0.01] border border-amber-500/15 dark:border-amber-500/10 rounded-2xl flex items-center justify-between gap-4 shadow-sm hover:shadow transition-shadow">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
                    <ShieldCheck size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-gray-800 dark:text-slate-200">Next Bill Number</span>
                      <span className="text-[8px] bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-black border border-amber-200/50 dark:border-amber-900/30 uppercase tracking-wider">Automatic</span>
                    </div>
                    <p className="text-[10px] text-gray-455 dark:text-slate-550 font-medium leading-relaxed mt-0.5">Automatically increments the bill number for each new order.</p>
                  </div>
                </div>
                <div className="px-4 py-2 bg-white dark:bg-slate-900 shadow-[inset_0_1px_3px_rgba(0,0,0,0.05)] text-gray-800 dark:text-slate-200 font-black text-base rounded-xl border border-gray-150 dark:border-slate-800/80 min-w-[70px] text-center shrink-0">
                  {globalSettings?.billSequence || 1}
                </div>
              </div>

              {/* Local Database Backup & Restore */}
              <div className="p-5 border border-gray-150 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900/40 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
                    <Database size={20} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-black text-gray-805 dark:text-slate-205 tracking-tight leading-none block">Local Database Backup</span>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 font-bold mt-1.5 leading-relaxed">Export all POS data (Menu, Bills, Customers, Expenses) to a JSON file or restore from a previous backup.</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  {/* Export Button */}
                  <button 
                    onClick={async () => {
                      try {
                        await exportDbToJson();
                        showToast('Local database backup exported successfully!', 'success');
                      } catch (err: any) {
                        showToast(`Export failed: ${err.message || err}`, 'error');
                      }
                    }}
                    className="px-3.5 py-2.5 border border-gray-205 dark:border-slate-800 text-gray-700 dark:text-slate-350 hover:bg-gray-50 dark:hover:bg-slate-850 rounded-xl font-bold text-[10px] transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-sm uppercase tracking-wider bg-transparent"
                  >
                    <Save size={12} />
                    Export
                  </button>

                </div>
              </div>

            </div>
          )}

          {/* TAB 2: PRINTER SETUP */}
          {activeSubTab === 'printer' && (
            <div className="flex flex-col gap-6 animate-fade-in">
              
              {/* Printer Mode Selection */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-gray-400 dark:text-slate-550 uppercase tracking-widest leading-none">Printer Mode</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
                  
                  {/* Single Printer */}
                  <div 
                    onClick={() => setFormData({ ...formData, printerMode: 'single' })}
                    className={`p-5 rounded-2xl border-2 cursor-pointer transition-all duration-300 flex items-center justify-between select-none shadow-sm ${
                      formData.printerMode === 'single'
                        ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                        : 'border-gray-200/60 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl transition-all duration-300 shrink-0 ${formData.printerMode === 'single' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 dark:bg-slate-800 text-gray-500'}`}>
                        <Printer size={18} />
                      </div>
                      <div>
                        <span className="font-extrabold text-xs text-gray-800 dark:text-slate-205 block">Single Printer</span>
                        <p className="text-[10px] text-gray-400 dark:text-slate-500 font-bold mt-0.5">Use one printer for receipts and KOTs.</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-center justify-center p-1 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-200 dark:border-slate-800 w-16 h-10 relative shrink-0 ml-2">
                      <Printer size={16} className={formData.printerMode === 'single' ? 'text-indigo-500 animate-[pulse_3s_infinite]' : 'text-gray-400 dark:text-slate-600'} />
                      <span className="text-[6px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest leading-none mt-1">ALL-IN-ONE</span>
                    </div>
                  </div>

                  {/* Multiple Printers */}
                  <div 
                    onClick={() => {
                      if (premiumState.isPremium) {
                        setFormData({ ...formData, printerMode: 'multiple' });
                      } else {
                        showToast('👑 Multiple Printers is a Premium feature! Please activate premium inside the Subscription tab.', 'error');
                      }
                    }}
                    className={`p-5 rounded-2xl border-2 cursor-pointer transition-all duration-300 flex items-center justify-between select-none shadow-sm relative ${
                      formData.printerMode === 'multiple'
                        ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                        : 'border-gray-200/60 dark:border-slate-800 hover:border-gray-355 dark:hover:border-slate-700 bg-white dark:bg-slate-900/40'
                    }`}
                  >
                    {!premiumState.isPremium && (
                      <span className="absolute top-1.5 right-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black text-[7px] px-1.5 py-0.5 rounded-full shadow border border-amber-400/20 tracking-wider uppercase scale-90">
                        👑 PRO
                      </span>
                    )}
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl transition-all duration-300 shrink-0 ${formData.printerMode === 'multiple' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'bg-gray-100 dark:bg-slate-800 text-gray-500'}`}>
                        <Layers size={18} />
                      </div>
                      <div>
                        <span className="font-extrabold text-xs text-gray-800 dark:text-slate-205 block">Multiple Printers</span>
                        <p className="text-[10px] text-gray-405 dark:text-slate-500 font-bold mt-0.5">Route orders to counter, kitchen, or bar printers.</p>
                      </div>
                    </div>

                    <div className="flex gap-0.5 items-center justify-center p-1 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-200 dark:border-slate-800 w-16 h-10 relative shrink-0 ml-2">
                      <div className="flex flex-col gap-0.5 items-center">
                        <Printer size={8} className={formData.printerMode === 'multiple' ? 'text-indigo-400' : 'text-gray-405'} />
                        <span className="text-[5px] font-black text-gray-400 scale-90">REC</span>
                      </div>
                      <div className="flex flex-col gap-0.5 items-center">
                        <Printer size={8} className={formData.printerMode === 'multiple' ? 'text-orange-400' : 'text-gray-405'} />
                        <span className="text-[5px] font-black text-gray-400 scale-90">KIT</span>
                      </div>
                      <div className="flex flex-col gap-0.5 items-center">
                        <Printer size={8} className={formData.printerMode === 'multiple' ? 'text-teal-400' : 'text-gray-405'} />
                        <span className="text-[5px] font-black text-gray-400 scale-90">BAR</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Connected Printers & Status */}
              <div className="flex flex-col gap-3.5">
                <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest leading-none">Connected Printers & Status</label>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-1">
                  {formData.printerMode === 'single' ? (
                    <div className={`p-4.5 rounded-2xl border transition-all duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm md:col-span-3 ${
                      printerStatus.generic 
                        ? 'border-emerald-500/25 bg-gradient-to-tr from-emerald-500/[0.02] to-teal-500/[0.01] dark:from-emerald-500/[0.05] dark:to-teal-500/[0.02]' 
                        : 'border-gray-150 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/30'
                    }`}>
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`p-3 rounded-xl shrink-0 transition-all duration-300 relative ${
                          printerStatus.generic 
                            ? 'bg-gradient-to-tr from-emerald-500 via-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25' 
                            : 'bg-gray-100 dark:bg-slate-800 text-gray-405'
                        }`}>
                          <Cpu size={20} />
                          {printerStatus.generic && (
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-gray-800 dark:text-slate-200 tracking-tight">Receipt/KOT Printer</span>
                            <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-black border uppercase tracking-wider ${
                              printerStatus.generic 
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                                : 'bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-455 dark:text-slate-555'
                            }`}>
                              {printerStatus.generic ? 'ONLINE' : 'OFFLINE'}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 dark:text-slate-500 font-bold mt-1.5">Handles receipts, billing, and KOTs.</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          ThermalPrinter.connect(true)
                            .then(() => { checkPrinters(); showToast('Printer connected successfully!', 'success'); })
                            .catch((err: any) => { checkPrinters(); showToast(err?.message || 'Printer connection failed.', 'error'); });
                        }}
                        className={`w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 border border-indigo-500/10 text-white rounded-xl font-bold text-[10px] transition-all cursor-pointer active:scale-95 shadow-sm shrink-0 uppercase tracking-wider`}
                      >
                        {printerStatus.generic ? 'Reconnect' : 'Connect'}
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Counter receipt printer */}
                      <div className={`p-4.5 rounded-2xl border transition-all duration-300 flex flex-col justify-between gap-4 shadow-sm ${
                        printerStatus.receipt 
                          ? 'border-emerald-500/25 bg-gradient-to-tr from-emerald-500/[0.02] to-teal-500/[0.01] dark:from-emerald-500/[0.05] dark:to-teal-500/[0.02]' 
                          : 'border-gray-150 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/30'
                      }`}>
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className={`p-2.5 rounded-xl shrink-0 transition-all duration-300 relative ${
                            printerStatus.receipt 
                              ? 'bg-gradient-to-tr from-emerald-500 via-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25' 
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500'
                          }`}>
                            <Printer size={18} />
                            {printerStatus.receipt && (
                              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-gray-850 dark:text-slate-200 tracking-tight">Receipt Printer</span>
                              <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-black border uppercase tracking-wider ${
                                printerStatus.receipt 
                                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                                  : 'bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-455 dark:text-slate-550'
                              }`}>
                                {printerStatus.receipt ? 'ONLINE' : 'OFFLINE'}
                              </span>
                            </div>
                            <p className="text-[9px] text-gray-400 dark:text-slate-500 font-bold mt-1">Receipts and checkouts.</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            ThermalPrinter.connectReceipt(true)
                              .then(() => { checkPrinters(); showToast('Receipt printer connected successfully!', 'success'); })
                              .catch((err: any) => { checkPrinters(); showToast(err?.message || 'Receipt printer connection failed.', 'error'); });
                          }}
                          className={`w-full py-2 rounded-xl font-bold text-[9px] transition-all cursor-pointer active:scale-95 shadow-sm border uppercase tracking-wider ${
                            printerStatus.receipt
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white'
                              : 'bg-indigo-600 border-indigo-500/10 text-white hover:bg-indigo-700 hover:shadow-indigo-500/20 shadow-md'
                          }`}
                        >
                          {printerStatus.receipt ? 'Reconnect' : 'Connect'}
                        </button>
                      </div>

                      {/* Kitchen printer */}
                      <div className={`p-4.5 rounded-2xl border transition-all duration-300 flex flex-col justify-between gap-4 shadow-sm ${
                        printerStatus.kot 
                          ? 'border-emerald-500/25 bg-gradient-to-tr from-emerald-500/[0.02] to-teal-500/[0.01] dark:from-emerald-500/[0.05] dark:to-teal-500/[0.02]' 
                          : 'border-gray-150 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/30'
                      }`}>
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className={`p-2.5 rounded-xl shrink-0 transition-all duration-300 relative ${
                            printerStatus.kot 
                              ? 'bg-gradient-to-tr from-emerald-500 via-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25' 
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500'
                          }`}>
                            <Cpu size={18} />
                            {printerStatus.kot && (
                              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-gray-850 dark:text-slate-200 tracking-tight">Kitchen Printer</span>
                              <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-black border uppercase tracking-wider ${
                                printerStatus.kot 
                                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                                  : 'bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-455 dark:text-slate-550'
                              }`}>
                                {printerStatus.kot ? 'ONLINE' : 'OFFLINE'}
                              </span>
                            </div>
                            <p className="text-[9px] text-gray-450 dark:text-slate-500 font-bold mt-1">Kitchen Order Tickets.</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            ThermalPrinter.connectKOT(true)
                              .then(() => { checkPrinters(); showToast('Kitchen printer connected successfully!', 'success'); })
                              .catch((err: any) => { checkPrinters(); showToast(err?.message || 'Kitchen printer connection failed.', 'error'); });
                          }}
                          className={`w-full py-2 rounded-xl font-bold text-[9px] transition-all cursor-pointer active:scale-95 shadow-sm border uppercase tracking-wider ${
                            printerStatus.kot
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white'
                              : 'bg-indigo-600 border-indigo-500/10 text-white hover:bg-indigo-700 hover:shadow-indigo-500/20 shadow-md'
                          }`}
                        >
                          {printerStatus.kot ? 'Reconnect' : 'Connect'}
                        </button>
                      </div>

                      {/* Bar printer */}
                      <div className={`p-4.5 rounded-2xl border transition-all duration-300 flex flex-col justify-between gap-4 shadow-sm ${
                        printerStatus.bar 
                          ? 'border-emerald-500/25 bg-gradient-to-tr from-emerald-500/[0.02] to-teal-500/[0.01] dark:from-emerald-500/[0.05] dark:to-teal-500/[0.02]' 
                          : 'border-gray-150 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/30'
                      }`}>
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className={`p-2.5 rounded-xl shrink-0 transition-all duration-300 relative ${
                            printerStatus.bar 
                              ? 'bg-gradient-to-tr from-emerald-555 via-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25' 
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500'
                          }`}>
                            <Layers size={18} />
                            {printerStatus.bar && (
                              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-gray-850 dark:text-slate-200 tracking-tight">Bar Printer</span>
                              <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-black border uppercase tracking-wider ${
                                printerStatus.bar 
                                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                                  : 'bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-455 dark:text-slate-550'
                              }`}>
                                {printerStatus.bar ? 'ONLINE' : 'OFFLINE'}
                              </span>
                            </div>
                            <p className="text-[9px] text-gray-450 dark:text-slate-500 font-bold mt-1">Bar & drinks KOTs.</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            ThermalPrinter.connectBar(true)
                              .then(() => { checkPrinters(); showToast('Bar printer connected successfully!', 'success'); })
                              .catch((err: any) => { checkPrinters(); showToast(err?.message || 'Bar printer connection failed.', 'error'); });
                          }}
                          className={`w-full py-2 rounded-xl font-bold text-[9px] transition-all cursor-pointer active:scale-95 shadow-sm border uppercase tracking-wider ${
                            printerStatus.bar
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white'
                              : 'bg-indigo-600 border-indigo-500/10 text-white hover:bg-indigo-700 hover:shadow-indigo-500/20 shadow-md'
                          }`}
                        >
                          {printerStatus.bar ? 'Reconnect' : 'Connect'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Speed, Roll & Language configs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 border-t border-gray-100 dark:border-slate-800/80 pt-5">
                
                {/* Printer Interface (USB vs Bluetooth) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest leading-none">Printer Interface</label>
                  <select 
                    title="Printer Connection Type"
                    value={printerConnectionType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPrinterConnectionType(val);
                      localStorage.setItem('printerConnectionType', val);
                    }}
                    className="w-full p-3 rounded-2xl border border-gray-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 font-bold text-gray-800 dark:text-slate-200 text-xs bg-white dark:bg-[#0f172a] shadow-sm transition-all focus:ring-2 focus:ring-indigo-500/10 animate-fade-in"
                  >
                    <option value="serial">USB / COM Port (VCP)</option>
                    <option value="bluetooth">Bluetooth (Wireless)</option>
                  </select>
                </div>

                {/* Baud Rate */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest leading-none">Baud Rate (Speed)</label>
                  <select 
                    title="Baud Rate"
                    value={formData.baudRate}
                    onChange={(e) => setFormData({...formData, baudRate: Number(e.target.value)})}
                    className="w-full p-3 rounded-2xl border border-gray-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 font-bold text-gray-800 dark:text-slate-200 text-xs bg-white dark:bg-[#0f172a] shadow-sm transition-all focus:ring-2 focus:ring-indigo-500/10 animate-fade-in"
                  >
                    <option value={9600}>9600 bps (Standard)</option>
                    <option value={19200}>19200 bps</option>
                    <option value={38400}>38400 bps</option>
                    <option value={115200}>115200 bps</option>
                  </select>
                </div>

                {/* Printable Matrix */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-gray-400 dark:text-slate-555 uppercase tracking-widest leading-none">Paper Width</label>
                  <select 
                    title="Printer Width"
                    value={formData.printerWidth}
                    onChange={(e) => setFormData({...formData, printerWidth: Number(e.target.value)})}
                    className="w-full p-3 rounded-2xl border border-gray-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 font-bold text-gray-800 dark:text-slate-200 text-xs bg-white dark:bg-[#0f172a] shadow-sm transition-all focus:ring-2 focus:ring-indigo-500/10 animate-fade-in"
                  >
                    <option value={32}>32 Columns (58mm Roll)</option>
                    <option value={42}>42 Columns (80mm Roll)</option>
                    <option value={48}>48 Columns (80mm Wide)</option>
                  </select>
                </div>

                {/* Bill Language */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-gray-400 dark:text-slate-555 uppercase tracking-widest leading-none">Bill Language</label>
                  <select 
                    title="Bill Language"
                    value={formData.billLanguage}
                    onChange={(e) => setFormData({...formData, billLanguage: e.target.value})}
                    className="w-full p-3 rounded-2xl border border-gray-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 font-bold text-gray-800 dark:text-slate-200 text-xs bg-white dark:bg-[#0f172a] shadow-sm transition-all focus:ring-2 focus:ring-indigo-500/10 animate-fade-in"
                  >
                    <option value="en">English (Default)</option>
                    <option value="hi">Hindi (Hinglish)</option>
                  </select>
                </div>

              </div>

              {/* Cloud Printing Configuration */}
              <div className="flex flex-col gap-3.5 border-t border-gray-100 dark:border-slate-800/80 pt-5 mt-2">
                <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest leading-none">Cloud Printing Configuration</label>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  
                  {/* Toggle 1: Send Prints to Cloud */}
                  <div className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-4 ${
                    enableCloudPrintSending 
                      ? 'border-indigo-500/30 bg-gradient-to-tr from-indigo-500/[0.02] to-purple-500/[0.01] dark:from-indigo-500/[0.05] dark:to-purple-500/[0.02]' 
                      : 'border-gray-150 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/20 shadow-sm'
                  }`}>
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`p-2.5 rounded-xl transition-all duration-300 shrink-0 ${
                        enableCloudPrintSending 
                          ? 'bg-gradient-to-tr from-indigo-500 to-purple-650 text-white shadow-md shadow-indigo-500/15' 
                          : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500'
                      }`}>
                        <Cloud size={18} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-gray-805 dark:text-slate-202 tracking-tight leading-none block">Send Prints to Cloud</span>
                        <p className="text-[10px] text-gray-405 dark:text-slate-500 font-bold mt-1.5 leading-relaxed pr-4">Send local bill actions to active print servers.</p>
                      </div>
                    </div>
                    <button
                      title="Send Prints to Cloud"
                      type="button"
                      onClick={() => {
                        const newVal = !enableCloudPrintSending;
                        setEnableCloudPrintSending(newVal);
                        localStorage.setItem('enableCloudPrintSending', String(newVal));
                      }}
                      className={`w-10 h-6 rounded-full transition-all duration-300 flex items-center p-1 cursor-pointer select-none shrink-0 relative ${
                        enableCloudPrintSending ? 'bg-gradient-to-r from-indigo-500 to-purple-650 shadow-[0_0_8px_rgba(99,102,241,0.35)]' : 'bg-gray-250 dark:bg-slate-700'
                      }`}
                    >
                      <div className={`bg-white w-4 h-4 rounded-full shadow transition-transform duration-300 ${
                        enableCloudPrintSending ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>

                  {/* Toggle 2: Receive Prints from Cloud */}
                  <div className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-4 ${
                    enableCloudPrintReceiving 
                      ? 'border-indigo-500/30 bg-gradient-to-tr from-indigo-500/[0.02] to-purple-500/[0.01] dark:from-indigo-500/[0.05] dark:to-purple-500/[0.02]' 
                      : 'border-gray-150 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/20 shadow-sm'
                  }`}>
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`p-2.5 rounded-xl transition-all duration-300 shrink-0 ${
                        enableCloudPrintReceiving 
                          ? 'bg-gradient-to-tr from-indigo-500 to-purple-650 text-white shadow-md shadow-indigo-500/15' 
                          : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500'
                      }`}>
                        <Cloud size={18} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-gray-805 dark:text-slate-205 tracking-tight leading-none block">Receive Prints from Cloud</span>
                        <p className="text-[10px] text-gray-405 dark:text-slate-500 font-bold mt-1.5 leading-relaxed pr-4">Act as printer server for other network devices.</p>
                      </div>
                    </div>
                    <button
                      title="Receive Prints from Cloud"
                      type="button"
                      onClick={() => {
                        const newVal = !enableCloudPrintReceiving;
                        setEnableCloudPrintReceiving(newVal);
                        localStorage.setItem('enableCloudPrintReceiving', String(newVal));
                      }}
                      className={`w-10 h-6 rounded-full transition-all duration-300 flex items-center p-1 cursor-pointer select-none shrink-0 relative ${
                        enableCloudPrintReceiving ? 'bg-gradient-to-r from-indigo-500 to-purple-650 shadow-[0_0_8px_rgba(99,102,241,0.35)]' : 'bg-gray-250 dark:bg-slate-700'
                      }`}
                    >
                      <div className={`bg-white w-4 h-4 rounded-full shadow transition-transform duration-300 ${
                        enableCloudPrintReceiving ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>

                </div>
              </div>

            </div>
          )}

          {/* TAB 4: APP UPDATES */}
          {activeSubTab === 'updates' && (
            <div className="flex flex-col gap-6 animate-fade-in">
              
              {/* Version Badges Row */}
              <div className="flex flex-wrap items-center gap-3 bg-slate-50/50 dark:bg-slate-900/20 border border-gray-150 dark:border-slate-800/60 p-4 rounded-2xl justify-around shadow-sm">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-gray-450 dark:text-slate-550 font-bold">Branch:</span>
                  <span className="font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-100/50 dark:bg-indigo-950/40 px-2.5 py-0.5 rounded-md border border-indigo-200/20">Production</span>
                </div>
                <div className="w-px h-3 bg-gray-250 dark:bg-slate-800" />
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-gray-450 dark:text-slate-555 font-bold">Tag:</span>
                  <span className="font-extrabold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-800/60 px-2.5 py-0.5 rounded-md border border-gray-205/20 dark:border-slate-705/20">v{appVersion}</span>
                </div>
                <div className="w-px h-3 bg-gray-250 dark:bg-slate-800" />
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-gray-450 dark:text-slate-555 font-bold">Environment:</span>
                  <span className="font-extrabold text-green-600 dark:text-green-400 bg-green-100/50 dark:bg-green-950/40 px-2.5 py-0.5 rounded-md border border-green-200/20">Stable Release</span>
                </div>
              </div>

              {/* Main Check actions */}
              <div className="p-6 bg-gradient-to-tr from-indigo-500/[0.02] to-purple-500/[0.005] border border-indigo-500/10 rounded-3xl flex flex-col gap-4 shadow-sm">
                <div>
                  <h4 className="font-black text-xs text-gray-805 dark:text-slate-200 tracking-tight">Check for Updates</h4>
                  <p className="text-[10px] text-gray-405 dark:text-slate-500 font-bold mt-1 leading-relaxed">
                    Check if there is a newer version of the app available. Recommended updates will be downloaded automatically.
                  </p>
                </div>

                <button 
                  onClick={handleCheckUpdates}
                  disabled={updateStatus.type === 'checking' || updateStatus.type === 'downloading'}
                  className="w-fit px-4.5 py-2.5 bg-indigo-600 hover:bg-indigo-755 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-450 dark:disabled:text-slate-550 text-white font-bold text-[10px] rounded-xl transition-all shadow-md shadow-indigo-505/15 hover:shadow flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer animate-[pulse_6s_infinite]"
                >
                  <RefreshCw size={12} className={updateStatus.type === 'checking' || updateStatus.type === 'downloading' ? 'animate-spin' : ''} />
                  {updateStatus.type === 'checking' ? 'Connecting...' : updateStatus.type === 'downloading' ? 'Downloading...' : 'Check for Updates'}
                </button>

                {updateStatus.type !== 'idle' && (
                  <div className={`p-4 rounded-2xl border text-[11px] transition-all mt-1 shadow-sm leading-relaxed ${
                    updateStatus.type === 'error' ? 'bg-red-50 dark:bg-red-950/10 border-red-100/40 dark:border-red-900/30 text-red-750 dark:text-red-400 font-bold' :
                    updateStatus.type === 'downloaded' || updateStatus.type === 'not-available' ? 'bg-green-50 dark:bg-green-950/10 border-green-100/40 dark:border-green-900/30 text-green-700 dark:text-green-400 font-bold' :
                    'bg-indigo-55 dark:bg-indigo-950/10 border-indigo-100/40 dark:border-indigo-900/30 text-indigo-750 dark:text-indigo-400 font-bold'
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {updateStatus.type === 'error' ? <AlertCircle size={14} className="text-red-500" /> : <CheckCircle2 size={14} className="text-green-500" />}
                      <span className="truncate">{updateStatus.message}</span>
                    </div>
                    
                    {updateStatus.type === 'downloading' && (
                      <div className="w-full h-1.5 bg-indigo-100 dark:bg-indigo-950/30 rounded-full mt-2.5 overflow-hidden">
                        <div 
                          ref={progressRef}
                          className="h-full bg-indigo-650 transition-all duration-300 rounded-full" 
                        />
                      </div>
                    )}

                    {updateStatus.releaseNotes && (
                      <div className="mt-3.5 p-4 bg-white dark:bg-[#0b0f19] rounded-2xl border border-gray-150 dark:border-slate-800/80 max-h-40 overflow-y-auto shadow-inner">
                        <p className="text-[9px] font-black uppercase text-gray-400 dark:text-slate-500 mb-2 tracking-wider leading-none">Patch Notes</p>
                        <div 
                          className="text-[10px] text-gray-600 dark:text-slate-350 leading-relaxed font-semibold"
                          dangerouslySetInnerHTML={{ 
                            __html: typeof updateStatus.releaseNotes === 'string' 
                              ? updateStatus.releaseNotes 
                              : Array.isArray(updateStatus.releaseNotes) 
                                ? updateStatus.releaseNotes.map(n => typeof n === 'string' ? n : n.note).join('<br/>') 
                                : '' 
                          }}
                        />
                      </div>
                    )}

                    {updateStatus.type === 'downloaded' && (
                      <button 
                        onClick={() => electronAPI?.quitAndInstall()}
                        className="w-full mt-3 py-3 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl transition-all text-xs active:scale-95 shadow-md shadow-green-500/10 cursor-pointer"
                      >
                        RESTART APP NOW
                      </button>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 5: QR CODE GENERATOR */}
          {activeSubTab === 'qr_generator' && (
            <div className="flex flex-col gap-6 animate-fade-in text-gray-800 dark:text-slate-100">
              
              {/* Introduction Card */}
              <div className="p-6 bg-gradient-to-tr from-indigo-500/[0.02] to-purple-500/[0.005] border border-indigo-500/10 rounded-3xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
                <div className="max-w-xl">
                  <h4 className="font-black text-sm text-gray-850 dark:text-slate-200 tracking-tight">QR Code Self-Ordering</h4>
                  <p className="text-[11px] text-gray-450 dark:text-slate-500 font-bold mt-1.5 leading-relaxed">
                    Generate unique QR Codes for your Dine-in tables. Customers can scan the QR code to open your digital menu page on their phone, input the table PIN, and place orders directly from their tables.
                  </p>
                </div>
                {!globalSettings?.restaurantCode && (
                  <div className="px-3.5 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 rounded-xl text-[10px] text-amber-700 dark:text-amber-400 font-bold max-w-xs leading-relaxed">
                    ⚠️ Please set your Restaurant Code in Profile Settings first to enable QR ordering.
                  </div>
                )}
              </div>
 


              {/* Printable Table QR Codes Grid */}
              {globalSettings?.restaurantCode && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {tables.map((tbl) => {
                    const orderUrl = getPublicOrderingUrl(globalSettings.restaurantCode, tbl.id);
                    return (
                      <div key={tbl.id} className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800/80 rounded-2xl p-5 flex flex-col items-center gap-4 shadow-sm hover:shadow-md transition-all">
                        <div className="font-extrabold text-sm text-gray-850 dark:text-slate-100">
                          Table {tbl.id}
                        </div>
                        
                        <div className="bg-white p-3 rounded-xl border border-gray-100 dark:border-slate-200">
                          <QRCodeSVG
                            value={orderUrl}
                            size={120}
                            level="H"
                            includeMargin={false}
                          />
                        </div>

                        <div className="text-[10px] font-bold text-gray-450 dark:text-slate-500 truncate max-w-full text-center">
                          PIN: <span className="font-black text-indigo-600 dark:text-indigo-400">{tbl.tablePin || '---'}</span>
                        </div>

                        <button
                          onClick={() => handlePrintQR(tbl.id)}
                          className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-black rounded-xl text-[10px] transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-indigo-200/10"
                        >
                          <Printer size={12} />
                          Print Code
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          )}

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
