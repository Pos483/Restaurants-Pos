import { useState, useEffect, useRef } from 'react';
import { useLiveQuery, db, exportDbToJson, importDbFromJson } from '../db';
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
  Upload
} from 'lucide-react';
import { ThermalPrinter } from '../printer';
import { useToast } from './Toast';
import { usePremium } from '../hooks/usePremium';
import { useApp } from '../contexts/AppContext';

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
      className={`flex items-center justify-between text-left py-3 px-4 rounded-2xl transition-all duration-300 select-none md:w-full shrink-0 gap-2 border outline-none cursor-pointer text-xs font-black hover:translate-x-0.5 ${
        active
          ? 'bg-gradient-to-r from-indigo-500/10 via-purple-500/[0.03] to-transparent border-l-4 border-indigo-600 dark:border-indigo-500 border-t-transparent border-r-transparent border-b-transparent text-indigo-950 dark:text-indigo-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
          : 'bg-transparent border-transparent hover:bg-gray-50/70 dark:hover:bg-slate-800/35 text-gray-550 dark:text-slate-450 hover:text-gray-800 dark:hover:text-slate-200'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-xl transition-all duration-300 shrink-0 ${
          active 
            ? 'bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20' 
            : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-450'
        }`}>
          {icon}
        </div>
        <span className="hidden md:inline leading-none font-bold text-xs tracking-tight">{label}</span>
      </div>
      {badge && <div className="hidden md:block shrink-0">{badge}</div>}
    </button>
  );
}

export default function RestaurantSettings() {
  const premiumState = usePremium();
  const { categoryLayout: currentLayout, setCategoryLayout } = useApp();
  const { showToast } = useToast();
  
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'printer' | 'whatsapp' | 'updates'>('general');

  const globalSettings = useLiveQuery(async () => {
    const profile = await db.restaurantProfile.get('global');
    const sys = await db.restaurantSettings.get('global');
    return { ...(profile || {}), ...(sys || {}) };
  }, [], ['restaurant_profile', 'restaurant_settings']);

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
    billLanguage: 'en'
  });

  const [appVersion, setAppVersion] = useState(import.meta.env.VITE_APP_VERSION || '2.0.5');

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
        billLanguage: localStorage.getItem('billLanguage') || globalSettings.billLanguage || 'en'
      });
    }
  }, [globalSettings, currentLayout]);

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

  const handleToggle = (name: keyof typeof formData) => {
    setFormData({ ...formData, [name]: !formData[name] });
  };

  const handleSave = async () => {
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
        gstPercentage: existingSettings.gstPercentage || 5
      } as any);

      localStorage.setItem('billLanguage', formData.billLanguage);

      setCategoryLayout(formData.categoryLayout as 'top' | 'sidebar');
      showToast('Restaurant Settings Updated Successfully!', 'success');
      checkPrinters();
    } catch (err: any) {
      console.error('Error saving settings:', err);
      showToast(`Error saving settings: ${err.message || err}`, 'error');
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
      
      {/* Header bar within settings card (saves 100px vertical height) */}
      <div className="relative overflow-hidden px-6 py-5 border-b border-gray-100 dark:border-slate-850/60 bg-gradient-to-r from-slate-50/50 via-white to-slate-50/30 dark:from-slate-900/40 dark:via-[#1e293b]/20 dark:to-slate-900/30 shrink-0">
        {/* Soft background glow */}
        <div className="absolute top-0 right-1/4 w-72 h-72 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 right-10 w-48 h-48 bg-purple-500/5 dark:bg-purple-500/5 rounded-full blur-2xl pointer-events-none"></div>
        
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 p-2.5 rounded-2xl text-white shadow-md shadow-indigo-500/10 shrink-0 animate-[pulse_3s_infinite]">
              <Settings size={22} className="animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-lg font-black text-gray-800 dark:text-slate-100 tracking-tight leading-tight">
                System Settings
              </h1>
              <p className="text-gray-450 dark:text-slate-550 text-[10px] font-bold mt-1 tracking-wider uppercase flex items-center gap-1.5 leading-none">
                v{appVersion} <span className="text-gray-300 dark:text-slate-700">•</span> <span>{activeSubTab === 'general' ? 'General & Layout' : activeSubTab === 'printer' ? 'Printer Setup' : 'App Updates'}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={handleSave}
            className="px-4.5 py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold shadow-md shadow-indigo-500/15 hover:shadow-indigo-500/25 transition-all duration-200 flex items-center gap-2 text-xs shrink-0 active:scale-95 cursor-pointer border border-indigo-500/20"
          >
            <Save size={14} className="animate-pulse" />
            Save Settings
          </button>
        </div>
      </div>

      {/* Two-Pane Navigation Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        
        {/* Left compact sidebar */}
        <div className="w-full md:w-52 bg-slate-50/50 dark:bg-slate-900/10 border-b md:border-b-0 md:border-r border-gray-100 dark:border-slate-800/60 p-3 flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-y-auto shrink-0 scrollbar-hide md:pr-2 min-w-0">
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
        <div className="flex-1 overflow-y-auto p-5 md:p-6 min-h-0 bg-white/50 dark:bg-slate-950/10">
          
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

                  {/* Import Button (File Upload Wrapper) */}
                  <label className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-[10px] transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-sm uppercase tracking-wider select-none">
                    <Upload size={12} />
                    Import
                    <input 
                      type="file" 
                      accept=".json" 
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        if (confirm('Are you sure you want to restore database from backup? This will merge records based on their IDs.')) {
                          const res = await importDbFromJson(file);
                          if (res.success) {
                            showToast(res.message, 'success');
                          } else {
                            showToast(res.message, 'error');
                          }
                        }
                        // Reset input value so same file can be uploaded again
                        e.target.value = '';
                      }}
                    />
                  </label>
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
                        onClick={() => ThermalPrinter.connect(true).then(checkPrinters).catch(checkPrinters)}
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
                          onClick={() => ThermalPrinter.connectReceipt(true).then(checkPrinters).catch(checkPrinters)}
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
                          onClick={() => ThermalPrinter.connectKOT(true).then(checkPrinters).catch(checkPrinters)}
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
                          onClick={() => ThermalPrinter.connectBar(true).then(checkPrinters).catch(checkPrinters)}
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

        </div>
      </div>
    </div>
  );
}
