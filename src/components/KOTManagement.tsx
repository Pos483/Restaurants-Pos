import { useState, useEffect } from 'react';
import { useLiveQuery, db, DBKdsOrder } from '../db';
import { ChefHat, Clock, CheckCircle2, PlayCircle, CheckCheck, History, Trash2, XCircle, Printer, Calendar } from 'lucide-react';
import { ThermalPrinter } from '../printer';
import ConfirmModal from './ConfirmModal';

export default function KOTManagement() {
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [cancellingKot, setCancellingKot] = useState<DBKdsOrder | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  // Get all KOTs from database
  const allKots = useLiveQuery(() => db.kdsOrders.toArray(), [], 'kds_orders');
  
  // Filter by selected date
  const kotsOnDate = allKots?.filter(k => {
    const kotDate = new Date(k.timestamp).toISOString().split('T')[0];
    return kotDate === selectedDate;
  }) || [];

  // Filter out delivered and completed ones, keep the rest on screen
  const activeKots = kotsOnDate.filter(k => k.status !== 'completed' && k.status !== 'delivered' && k.status !== 'cancelled').sort((a, b) => a.timestamp - b.timestamp);
  const completedKots = kotsOnDate.filter(k => k.status === 'completed' || k.status === 'delivered' || k.status === 'cancelled').sort((a, b) => b.timestamp - a.timestamp); // Latest first

  const handleUpdateStatus = async (id: string, newStatus: 'preparing' | 'ready' | 'delivered') => {
    const updateData: Partial<DBKdsOrder> = { status: newStatus };
    if (newStatus === 'ready' || newStatus === 'delivered') {
      const kot = await db.kdsOrders.get(id);
      if (kot && !kot.completedAt) {
        updateData.completedAt = Date.now();
      }
    }
    await db.kdsOrders.update(id, updateData);
  };

  const handleCancelKot = (kot: DBKdsOrder) => {
    setCancellingKot(kot);
  };

  const executeCancelKot = async () => {
    if (!cancellingKot) return;
    try {
      await db.kdsOrders.update(cancellingKot.id, { status: 'cancelled' });
      await ThermalPrinter.printCancelKOT(cancellingKot.tableOrType, cancellingKot.kotNumber, cancellingKot.items).catch(console.error);
    } catch (err) {
      console.error(err);
    } finally {
      setCancellingKot(null);
    }
  };

  const handleReprintKot = async (kot: DBKdsOrder) => {
    await ThermalPrinter.printKOT(kot.tableOrType, kot.items, kot.kotNumber);
  };

  const handleClearCompleted = () => {
    setShowClearConfirm(true);
  };

  const executeClearCompleted = async () => {
    try {
      for (const kot of completedKots) {
        await db.kdsOrders.delete(kot.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setShowClearConfirm(false);
    }
  };

  if (!allKots) return <div className="p-8 text-gray-500 dark:text-slate-400 font-bold">Loading Kitchen View...</div>;

  return (
    <div className="h-full flex flex-col gap-6 bg-gray-50 dark:bg-[#0B0F19] transition-colors duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0 px-2">
        <div className="flex items-center gap-4">
          <div className="bg-red-500 dark:bg-red-600 p-3 rounded-2xl text-white shadow-md dark:shadow-red-900/30">
            <ChefHat size={32} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-800 dark:text-white">Kitchen Display System (KDS)</h1>
            <p className="text-gray-500 dark:text-slate-400 font-medium">Live view of Kitchen Order Tickets (KOT)</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl p-1 rounded-2xl border border-gray-200 dark:border-slate-700/50 shadow-sm dark:shadow-none transition-colors">
          <div className="flex bg-gray-100 dark:bg-slate-800/60 p-1 rounded-xl">
            <button onClick={() => setActiveTab('active')} className={`px-6 py-2 font-bold rounded-lg transition-all ${activeTab === 'active' ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm dark:shadow-none' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}>Active Orders</button>
            <button onClick={() => setActiveTab('completed')} className={`px-6 py-2 font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'completed' ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm dark:shadow-none' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}>
              <History size={16} /> Completed
            </button>
          </div>
          <div className="h-8 w-px bg-gray-200 dark:bg-slate-700 mx-2 hidden sm:block"></div>
          <div className="flex items-center gap-2 px-3">
            <Calendar size={18} className="text-gray-400 dark:text-slate-500" />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none font-bold text-gray-700 dark:text-slate-200 focus:ring-0 cursor-pointer text-sm"
            />
          </div>
        </div>
      </div>

      {/* Active KOT Grid */}
      {activeTab === 'active' && (
        <div className="flex-1 overflow-auto px-2 pb-6">
          {activeKots.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-slate-500 gap-4 mt-20">
              <ChefHat size={64} className="opacity-20" />
              <span className="font-bold text-xl">No active orders in the kitchen.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {activeKots.map(kot => {
              const isTakeaway = kot.tableOrType.includes('Takeaway');
              let statusBadgeBg = 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300';
              let StatusIcon = Clock;
              let statusText = 'Pending';
              let pulseClass = '';

              if (kot.status === 'preparing') {
                statusBadgeBg = 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
                StatusIcon = PlayCircle;
                statusText = 'Preparing';
                pulseClass = 'animate-pulse';
              } else if (kot.status === 'ready') {
                statusBadgeBg = 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400';
                StatusIcon = CheckCircle2;
                statusText = 'Ready';
              }

              return (
              <div key={kot.id} className={`bg-white dark:bg-[#111827] rounded-3xl shadow-sm dark:shadow-none border-2 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 transition-colors ${kot.status === 'ready' ? 'border-green-300 dark:border-green-500/40 shadow-green-100 dark:shadow-green-900/20' : kot.status === 'preparing' ? 'border-blue-200 dark:border-blue-500/30' : 'border-orange-200 dark:border-orange-500/30'}`}>
                <div className={`p-4 border-b-2 flex justify-between items-start ${isTakeaway ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-800/30' : 'bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-800/30'}`}>
                  <div>
                    <h3 className={`font-black text-2xl truncate max-w-[200px] ${isTakeaway ? 'text-indigo-800 dark:text-indigo-300' : 'text-red-800 dark:text-red-300'}`}>{kot.tableOrType}</h3>
                    <p className="text-sm font-bold text-gray-500 dark:text-slate-400 mt-1">KOT No: #{kot.kotNumber}</p>
                    <div className="flex flex-col gap-1 mt-1">
                      <p className="text-xs font-medium text-gray-400 dark:text-slate-500">{new Date(kot.timestamp).toLocaleTimeString()}</p>
                      <KOTTimer timestamp={kot.timestamp} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-bold shadow-sm ${statusBadgeBg}`}>
                      <StatusIcon size={16} className={pulseClass} /> {statusText}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleReprintKot(kot)} className="p-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-all" title="Reprint KOT">
                        <Printer size={18} />
                      </button>
                      <button onClick={() => handleCancelKot(kot)} className="p-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full hover:bg-red-200 dark:hover:bg-red-800/40 transition-all" title="Cancel KOT">
                        <XCircle size={18} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-5 flex-1 overflow-auto max-h-[300px]">
                  <div className="flex flex-col gap-4">
                    {kot.items.map((order, idx) => (
                      <div key={idx} className="flex justify-between items-start border-b border-gray-100 dark:border-slate-700/50 last:border-0 pb-4 last:pb-0 min-w-0">
                        <div className="font-bold text-gray-800 dark:text-slate-200 text-lg leading-tight pr-4 line-clamp-2 overflow-hidden min-w-0">
                          {order.menuItem?.name || order.name || 'Unknown Item'}
                        </div>
                        <div className={`font-black text-2xl px-3 py-1 rounded-xl shrink-0 ${isTakeaway ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'}`}>
                          {order.quantity}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-4 border-t border-gray-100 dark:border-slate-700/50 bg-gray-50 dark:bg-slate-800/30">
                  {(!kot.status || kot.status === 'pending') && (
                    <button 
                      onClick={() => handleUpdateStatus(kot.id, 'preparing')}
                      className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-sm dark:shadow-orange-900/20 active:scale-95"
                    >
                      <PlayCircle size={20} /> Mark Preparing
                    </button>
                  )}
                  {kot.status === 'preparing' && (
                    <button 
                      onClick={() => handleUpdateStatus(kot.id, 'ready')}
                      className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-sm dark:shadow-green-900/20 active:scale-95"
                    >
                      <CheckCircle2 size={20} /> Mark Ready
                    </button>
                  )}
                  {kot.status === 'ready' && (
                    <button 
                      onClick={() => handleUpdateStatus(kot.id, 'delivered')}
                      className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-sm dark:shadow-blue-900/20 active:scale-95"
                    >
                      <CheckCheck size={20} /> Mark Delivered
                    </button>
                  )}
                </div>
              </div>
            )})}
            </div>
          )}
        </div>
      )}

      {/* Completed KOT Grid */}
      {activeTab === 'completed' && (
        <div className="flex-1 overflow-auto px-2 pb-6 flex flex-col">
          {completedKots.length > 0 && (
            <div className="flex justify-end mb-4 pr-2">
              <button onClick={handleClearCompleted} className="flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/40 rounded-xl font-bold transition-all text-sm">
                <Trash2 size={16} /> Clear History
              </button>
            </div>
          )}
          
          {completedKots.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-slate-500 gap-4 mt-10">
              <History size={64} className="opacity-20" />
              <span className="font-bold text-xl">No completed KOTs yet.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {completedKots.map(kot => {
                const isCancelled = kot.status === 'cancelled';
                return (
                <div key={kot.id} className={`bg-white dark:bg-[#111827] rounded-3xl shadow-sm dark:shadow-none border-2 overflow-hidden flex flex-col opacity-80 hover:opacity-100 transition-all ${isCancelled ? 'border-red-200 dark:border-red-800/40' : 'border-gray-100 dark:border-slate-700/40'}`}>
                  <div className={`p-4 border-b-2 flex justify-between items-start ${isCancelled ? 'bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-800/30' : 'bg-gray-50 dark:bg-slate-800/30 border-gray-100 dark:border-slate-700/30'}`}>
                    <div>
                      <h3 className={`font-black text-2xl truncate max-w-[200px] ${isCancelled ? 'text-red-700 dark:text-red-400' : 'text-gray-600 dark:text-slate-300'}`}>{kot.tableOrType}</h3>
                      <p className="text-sm font-bold text-gray-400 dark:text-slate-500 mt-1">KOT No: #{kot.kotNumber}</p>
                      <div className="flex flex-col gap-1 mt-1">
                        <p className="text-xs font-medium text-gray-400 dark:text-slate-500">{new Date(kot.timestamp).toLocaleTimeString()}</p>
                        {kot.completedAt && (
                          <div className="flex items-center gap-1 text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full w-fit">
                            <Clock size={10} />
                            Ready in: {formatDuration(kot.timestamp, kot.completedAt)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-bold shadow-sm dark:shadow-none ${isCancelled ? 'bg-red-200 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-slate-400'}`}>
                        {isCancelled ? <XCircle size={16} /> : <CheckCheck size={16} />}
                        {isCancelled ? 'Cancelled' : 'Delivered'}
                      </div>
                      <button onClick={() => handleReprintKot(kot)} className="p-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-all" title="Reprint KOT">
                        <Printer size={16} />
                      </button>
                    </div>
                  </div>
                  <div className={`p-5 flex-1 overflow-auto ${isCancelled ? 'bg-red-50/30 dark:bg-red-950/10' : 'bg-gray-50/50 dark:bg-transparent'}`}>
                    <div className="flex flex-col gap-4">
                      {kot.items.map((order, idx) => (
                        <div key={idx} className={`flex justify-between items-start border-b last:border-0 pb-4 last:pb-0 min-w-0 ${isCancelled ? 'border-red-100 dark:border-red-800/20' : 'border-gray-200 dark:border-slate-700/30'}`}>
                          <div className={`font-bold text-lg leading-tight pr-4 line-clamp-2 overflow-hidden min-w-0 ${isCancelled ? 'text-red-800/70 dark:text-red-400/70' : 'text-gray-600 dark:text-slate-300'}`}>{order.menuItem?.name || order.name || 'Unknown Item'}</div>
                          <div className={`font-black text-xl px-3 py-1 rounded-xl shrink-0 ${isCancelled ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300'}`}>{order.quantity}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={cancellingKot !== null}
        title="Cancel KOT"
        message={cancellingKot ? `Are you sure you want to cancel KOT #${cancellingKot.kotNumber} for ${cancellingKot.tableOrType}?` : ''}
        onConfirm={executeCancelKot}
        onCancel={() => setCancellingKot(null)}
      />

      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear History"
        message="Are you sure you want to delete all completed KOTs from history?"
        onConfirm={executeClearCompleted}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}

function KOTTimer({ timestamp }: { timestamp: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = Math.floor((now - timestamp) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  let colorClass = 'text-gray-400';
  if (minutes >= 15) colorClass = 'text-red-600 font-black animate-pulse';
  else if (minutes >= 8) colorClass = 'text-orange-600 font-bold';
  else if (minutes >= 4) colorClass = 'text-blue-600 font-bold';

  return (
    <div className={`flex items-center gap-1 text-xs ${colorClass}`}>
      <Clock size={12} />
      <span className="tabular-nums">Elapsed: {minutes}m {seconds}s</span>
    </div>
  );
}

function formatDuration(start: number, end: number) {
  const elapsed = Math.floor((end - start) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return `${minutes}m ${seconds}s`;
}