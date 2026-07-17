import { useState } from 'react';
import { db, useLiveQuery, notifyGlobalChange, getNextKotNumber } from '../db';
import { 
  Globe, Bell, Clock, MapPin, Phone, User, CheckCircle2, XCircle, 
  ShieldAlert
} from 'lucide-react';
import { useToast } from './Toast';

export default function OnlineOrdersView() {
  const { showToast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'pending_dinein' | 'pending_online' | 'active_online' | 'completed_online'>('pending_dinein');

  // Load Self Orders (Dine-in Tables)
  const selfOrders = useLiveQuery(() => db.selfOrders.toArray(), [], 'self_orders') || [];
  const pendingDineIn = selfOrders.filter(o => o.status === 'pending');

  // Load Online Orders (Delivery & Takeaway)
  const onlineOrders = useLiveQuery(() => db.onlineOrders.toArray(), [], 'online_orders') || [];
  const pendingOnline = onlineOrders.filter(o => o.status === 'pending');
  const activeOnline = onlineOrders.filter(o => ['accepted', 'preparing', 'dispatched'].includes(o.status));
  const completedOnline = onlineOrders
    .filter(o => ['delivered', 'rejected'].includes(o.status))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // newest first

  // Handler to accept Dine-in Self Order
  const handleApproveDineIn = async (order: any) => {
    try {
      const activeTable = await db.activeOrders.get(Number(order.tableId));
      const existingOrders = activeTable?.orders || [];
      const mergedOrders = [...existingOrders];

      for (const selfItem of order.items) {
        const existingItem = mergedOrders.find(o => o.menuItem.id === selfItem.menuItem.id);
        if (existingItem) {
          existingItem.quantity += selfItem.quantity;
        } else {
          mergedOrders.push(selfItem);
        }
      }

      await db.activeOrders.put({
        id: Number(order.tableId),
        status: 'occupied',
        orders: mergedOrders,
        tablePin: activeTable?.tablePin || Math.floor(100 + Math.random() * 900).toString(),
        customerName: order.customerName || undefined,
        customerPhone: order.customerPhone || undefined
      } as any);

      await db.selfOrders.update(order.id, { status: 'approved' });

      try {
        const { ThermalPrinter } = await import('../printer');
        const kotNum = await getNextKotNumber();
        await ThermalPrinter.printKOT(Number(order.tableId), order.items, kotNum);
      } catch (printErr) {
        console.error('KOT auto-print failed:', printErr);
      }

      notifyGlobalChange('active_orders');
      notifyGlobalChange('self_orders');
    } catch (err) {
      console.error('Failed to approve dine-in order:', err);
    }
  };

  // Handler to reject Dine-in Self Order
  const handleRejectDineIn = async (orderId: string) => {
    try {
      await db.selfOrders.update(orderId, { status: 'rejected' });
      notifyGlobalChange('self_orders');
    } catch (err) {
      console.error('Failed to reject dine-in order:', err);
    }
  };

  // Handler to accept Online Order (Delivery/Takeaway)
  const handleAcceptOnline = async (order: any) => {
    try {
      await db.onlineOrders.update(order.id, { 
        status: 'accepted',
        paymentStatus: 'paid'
      });

      if (order.customerName && order.customerPhone) {
        const { upsertPosCustomer } = await import('../db/customers');
        const totalAmt = order.items.reduce((sum: number, item: any) => sum + ((item.menuItem?.price || item.price || 0) * item.quantity), 0);
        await upsertPosCustomer(order.customerName, order.customerPhone, totalAmt);
      }

      try {
        const { ThermalPrinter } = await import('../printer');
        const kotNum = await getNextKotNumber();

        // Print Kitchen KOT (Table 99 indicates Online order KOT)
        await ThermalPrinter.printKOT(99, order.items, kotNum);

        // Print Delivery/Takeaway Slip
        const globalSettings = await db.restaurantSettings.get('global');
        const profile = await db.restaurantProfile.get('global');
        const printerSettings = { ...(profile || {}), ...(globalSettings || {}) };
        await ThermalPrinter.printDeliverySlip(order, printerSettings);
      } catch (printErr) {
        console.error('KOT/Delivery printing failed:', printErr);
      }

      notifyGlobalChange('online_orders');
    } catch (err: any) {
      console.error('Failed to accept online order:', err);
      showToast(err.message || 'Failed to accept online order.', 'error');
    }
  };

  // Handler to reject Online Order
  const handleRejectOnline = async (orderId: string) => {
    try {
      await db.onlineOrders.update(orderId, { status: 'rejected' });
      notifyGlobalChange('online_orders');
    } catch (err: any) {
      console.error('Failed to reject online order:', err);
      showToast(err.message || 'Failed to reject online order.', 'error');
    }
  };

  // Update Online Order preparation status
  const handleUpdateOnlineStatus = async (orderId: string, newStatus: 'preparing' | 'dispatched' | 'delivered') => {
    try {
      await db.onlineOrders.update(orderId, { status: newStatus });
      
      if (newStatus === 'delivered') {
        const orderObj = await db.onlineOrders.get(orderId);
        if (orderObj) {
          const { finalizeOnlineOrderAsBill } = await import('../db');
          await finalizeOnlineOrderAsBill(orderObj);
          showToast('Order marked as delivered and recorded in sales bills.', 'success');
        }
      }
      
      notifyGlobalChange('online_orders');
    } catch (err: any) {
      console.error('Failed to update online order status:', err);
      showToast(err.message || 'Failed to update online order status.', 'error');
    }
  };

  return (
    <div className="flex-1 p-5 md:p-6 bg-slate-50 dark:bg-slate-950 flex flex-col gap-6 overflow-y-auto h-full scrollbar-hide text-gray-800 dark:text-slate-100">
      
      {/* 1. Header and Quick Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-slate-800 pb-5 shrink-0">
        <div>
          <h1 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2 uppercase tracking-wide">
            <Globe className="text-orange-500 animate-pulse" size={22} />
            Online Orders
          </h1>
          <p className="text-[11px] text-gray-400 dark:text-slate-500 font-bold uppercase mt-0.5 tracking-wider">
            Manage incoming dine-in table QR orders and home delivery/takeaway requests
          </p>
        </div>

        {/* Dynamic Badges Row */}
        <div className="flex gap-2">
          <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl flex items-center gap-2">
            <Bell size={13} className="text-indigo-650 dark:text-indigo-400" />
            <span className="text-[10px] font-black uppercase text-indigo-700 dark:text-indigo-400">Dine-In: {pendingDineIn.length} Pending</span>
          </div>
          <div className="px-4 py-2 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 rounded-2xl flex items-center gap-2">
            <Globe size={13} className="text-orange-500 dark:text-orange-400" />
            <span className="text-[10px] font-black uppercase text-orange-700 dark:text-orange-400">Online: {pendingOnline.length} Pending</span>
          </div>
        </div>
      </div>

      {/* 2. Tabs Selector bar */}
      <div className="flex gap-2 p-1.5 bg-slate-200/50 dark:bg-slate-900/80 rounded-2xl shrink-0 self-start border border-gray-200/50 dark:border-slate-800/40">
        <button
          onClick={() => setActiveSubTab('pending_dinein')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeSubTab === 'pending_dinein'
              ? 'bg-white dark:bg-slate-850 text-indigo-600 dark:text-indigo-400 shadow-xs border border-gray-200/10'
              : 'text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300'
          }`}
        >
          Dine-In Self Orders ({pendingDineIn.length})
        </button>
        <button
          onClick={() => setActiveSubTab('pending_online')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeSubTab === 'pending_online'
              ? 'bg-white dark:bg-slate-855 text-orange-600 dark:text-orange-450 shadow-xs border border-gray-200/10'
              : 'text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-350'
          }`}
        >
          Pending Online ({pendingOnline.length})
        </button>
        <button
          onClick={() => setActiveSubTab('active_online')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeSubTab === 'active_online'
              ? 'bg-white dark:bg-slate-850 text-emerald-600 dark:text-emerald-450 shadow-xs border border-gray-200/10'
              : 'text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-350'
          }`}
        >
          Active Tracking ({activeOnline.length})
        </button>
        <button
          onClick={() => setActiveSubTab('completed_online')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeSubTab === 'completed_online'
              ? 'bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-200 shadow-xs border border-gray-200/10'
              : 'text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-350'
          }`}
        >
          Completed ({completedOnline.length})
        </button>
      </div>

      {/* 3. Grid Content */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-8 scrollbar-hide">
        
        {/* Dine-In Self-Orders subtab */}
        {activeSubTab === 'pending_dinein' && (
          pendingDineIn.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center gap-3">
              <CheckCircle2 size={36} className="text-emerald-500" />
              <p className="text-xs font-extrabold text-gray-400 dark:text-slate-500">No pending Dine-in Table self orders!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {pendingDineIn.map((ord) => (
                <div key={ord.id} className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-850 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
                  <div className="flex justify-between items-start border-b border-gray-100 dark:border-slate-800/60 pb-3">
                    <div>
                      <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100/30 px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase">
                        Table {ord.tableId}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold ml-2">
                        {new Date(ord.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* Customer details */}
                  <div className="text-xs font-bold text-gray-650 dark:text-slate-350 flex flex-col gap-1 bg-slate-50 dark:bg-slate-950/20 p-3 rounded-2xl border border-gray-100 dark:border-slate-800/40">
                    <p className="flex items-center gap-1.5"><User size={13} className="text-gray-400" /> {ord.customerName}</p>
                    <p className="flex items-center gap-1.5"><Phone size={13} className="text-gray-400" /> {ord.customerPhone}</p>
                  </div>

                  {/* Items block */}
                  <div className="flex-1 flex flex-col gap-2 pl-1.5">
                    {ord.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-[11px] font-bold text-gray-650 dark:text-slate-300">
                        <span>{item.menuItem?.name || item.name} <span className="text-indigo-650 dark:text-indigo-400 font-black">x{item.quantity}</span></span>
                        <span>₹{((item.menuItem?.price || item.price || 0) * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Actions buttons */}
                  <div className="flex gap-2.5 mt-2 pt-3 border-t border-gray-100 dark:border-slate-800">
                    <button
                      onClick={() => handleRejectDineIn(ord.id)}
                      className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/10 dark:hover:bg-red-900/20 text-red-650 dark:text-red-400 font-black text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex justify-center items-center gap-1.5 border border-red-200/10 active:scale-95"
                    >
                      <XCircle size={13} />
                      Reject
                    </button>
                    <button
                      onClick={() => handleApproveDineIn(ord)}
                      className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex justify-center items-center gap-1.5 shadow-md shadow-green-500/10 active:scale-95 border border-white/5"
                    >
                      <CheckCircle2 size={13} />
                      Approve & KOT
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Pending Online Orders tab */}
        {activeSubTab === 'pending_online' && (
          pendingOnline.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center gap-3">
              <CheckCircle2 size={36} className="text-emerald-500" />
              <p className="text-xs font-extrabold text-gray-400 dark:text-slate-500">No pending Delivery or Takeaway orders!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {pendingOnline.map((ord) => {
                const totalAmt = ord.items.reduce((sum: number, item: any) => sum + ((item.menuItem?.price || item.price || 0) * item.quantity), 0);
                return (
                  <div key={ord.id} className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-850 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
                    <div className="flex justify-between items-start border-b border-gray-100 dark:border-slate-800/60 pb-3">
                      <div>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          ord.orderType === 'delivery'
                            ? 'bg-blue-50 text-blue-700 border-blue-100/50 dark:bg-blue-950/30 dark:text-blue-400'
                            : 'bg-amber-50 text-amber-800 border-amber-100/50 dark:bg-amber-950/30 dark:text-amber-400'
                        }`}>
                          {ord.orderType === 'delivery' ? 'Home Delivery' : 'Takeaway'}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold ml-2">
                          {new Date(ord.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className="text-xs font-black text-gray-900 dark:text-white">
                        ₹{totalAmt.toFixed(2)}
                      </span>
                    </div>

                    {/* Customer & Location information */}
                    <div className="text-xs font-bold text-gray-650 dark:text-slate-350 flex flex-col gap-1.5 bg-slate-50 dark:bg-slate-950/20 p-3 rounded-2xl border border-gray-100 dark:border-slate-800/40">
                      <p className="flex items-center gap-1.5"><User size={13} className="text-gray-400" /> {ord.customerName} ({ord.customerPhone})</p>
                      {ord.orderType === 'delivery' ? (
                        <p className="flex items-start gap-1.5"><MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" /> {ord.deliveryAddress}</p>
                      ) : (
                        <p className="flex items-center gap-1.5"><Clock size={13} className="text-gray-400" /> Pickup: {ord.pickupTime}</p>
                      )}
                    </div>

                    {/* Items List */}
                    <div className="flex-1 flex flex-col gap-2 pl-1.5">
                      {ord.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center text-[11px] font-bold text-gray-650 dark:text-slate-300">
                          <span>{item.menuItem?.name || item.name} <span className="text-indigo-600 dark:text-indigo-400 font-black">x{item.quantity}</span></span>
                          <span>₹{((item.menuItem?.price || item.price || 0) * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Alert info box */}
                    <p className="text-[9.5px] text-orange-655 bg-orange-50 dark:bg-orange-950/20 border border-orange-200/20 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1">
                      <ShieldAlert size={12} className="shrink-0 text-orange-500" /> Verify UPI payment before accepting!
                    </p>

                    {/* Action buttons */}
                    <div className="flex gap-2.5 mt-1 pt-3 border-t border-gray-100 dark:border-slate-800">
                      <button
                        onClick={() => handleRejectOnline(ord.id)}
                        className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/10 dark:hover:bg-red-900/20 text-red-650 dark:text-red-400 font-black text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex justify-center items-center gap-1.5 border border-red-200/10 active:scale-95"
                      >
                        <XCircle size={13} />
                        Reject
                      </button>
                      <button
                        onClick={() => handleAcceptOnline(ord)}
                        className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex justify-center items-center gap-1.5 shadow-md shadow-green-500/10 active:scale-95 border border-white/5"
                      >
                        <CheckCircle2 size={13} />
                        Accept & Print
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Active Online Tracking tab */}
        {activeSubTab === 'active_online' && (
          activeOnline.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center gap-3">
              <p className="text-xs font-extrabold text-gray-400 dark:text-slate-500">No active delivery or takeaway tracker orders.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {activeOnline.map((ord) => {
                const totalAmt = ord.items.reduce((sum: number, item: any) => sum + ((item.menuItem?.price || item.price || 0) * item.quantity), 0);
                return (
                  <div key={ord.id} className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-850 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
                    <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-800/60 pb-2.5">
                      <div className="flex gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                          ord.orderType === 'delivery'
                            ? 'bg-blue-50 text-blue-700 border-blue-100/50 dark:bg-blue-950/30 dark:text-blue-400'
                            : 'bg-amber-50 text-amber-800 border-amber-100/50 dark:bg-amber-950/30 dark:text-amber-400'
                        }`}>
                          {ord.orderType === 'delivery' ? 'Home Delivery' : 'Takeaway'}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                          ord.status === 'accepted' ? 'bg-yellow-50 text-yellow-600 border-yellow-250/20 dark:bg-yellow-950/20 dark:text-yellow-400' :
                          ord.status === 'preparing' ? 'bg-indigo-50 text-indigo-650 border-indigo-250/20 dark:bg-indigo-950/20 dark:text-indigo-400' :
                          'bg-blue-50 text-blue-600 border-blue-250/20 dark:bg-blue-950/20 dark:text-blue-400'
                        }`}>
                          {ord.status === 'accepted' ? 'Accepted' :
                           ord.status === 'preparing' ? 'Preparing' :
                           'Out for Delivery'}
                        </span>
                      </div>
                      <span className="text-xs font-black text-gray-800 dark:text-slate-100">₹{totalAmt.toFixed(2)}</span>
                    </div>

                    {/* Contact & Dispatch Address details */}
                    <div className="text-xs font-bold text-gray-655 dark:text-slate-350 flex flex-col gap-1">
                      <p><span className="text-gray-400">Name:</span> {ord.customerName} ({ord.customerPhone})</p>
                      {ord.orderType === 'delivery' ? (
                        <p><span className="text-gray-400">Address:</span> {ord.deliveryAddress}</p>
                      ) : (
                        <p><span className="text-gray-400">Pickup:</span> {ord.pickupTime}</p>
                      )}
                    </div>

                    {/* Progress actions workflow */}
                    <div className="flex justify-end gap-2 mt-auto pt-3 border-t border-gray-100 dark:border-slate-800/40">
                      {ord.status === 'accepted' && (
                        <button
                          onClick={() => handleUpdateOnlineStatus(ord.id, 'preparing')}
                          className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-450 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer transition-all border border-indigo-100 dark:border-indigo-900/20 flex items-center gap-1 active:scale-95"
                        >
                          👨‍🍳 Start Preparing
                        </button>
                      )}
                      {ord.status === 'preparing' && (
                        <button
                          onClick={() => handleUpdateOnlineStatus(ord.id, 'dispatched')}
                          className="px-4 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 text-blue-650 dark:text-blue-400 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer transition-all border border-blue-100 dark:border-blue-900/20 flex items-center gap-1 active:scale-95"
                        >
                          🚚 Dispatch Order
                        </button>
                      )}
                      {(ord.status === 'dispatched' || (ord.orderType === 'takeaway' && ['accepted', 'preparing'].includes(ord.status))) && (
                        <button
                          onClick={() => handleUpdateOnlineStatus(ord.id, 'delivered')}
                          className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer transition-all border border-emerald-100 dark:border-emerald-900/20 flex items-center gap-1 active:scale-95"
                        >
                          <CheckCircle2 size={12} />
                          {ord.orderType === 'delivery' ? 'Mark Delivered' : 'Mark Picked Up'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Completed Online Orders tab */}
        {activeSubTab === 'completed_online' && (
          completedOnline.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center gap-3">
              <CheckCircle2 size={36} className="text-gray-300 dark:text-slate-700" />
              <p className="text-xs font-extrabold text-gray-400 dark:text-slate-500">No completed orders yet today.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {completedOnline.map((ord) => {
                const totalAmt = ord.items.reduce((sum: number, item: any) => sum + ((item.menuItem?.price || item.price || 0) * item.quantity), 0);
                const isDelivered = ord.status === 'delivered';
                return (
                  <div key={ord.id} className={`bg-white dark:bg-slate-900 border rounded-3xl p-5 shadow-sm flex flex-col gap-4 ${
                    isDelivered
                      ? 'border-emerald-200/60 dark:border-emerald-900/30'
                      : 'border-red-200/60 dark:border-red-900/30'
                  }`}>
                    {/* Header */}
                    <div className="flex justify-between items-start border-b border-gray-100 dark:border-slate-800/60 pb-3">
                      <div className="flex gap-2 flex-wrap">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          (ord.orderType || ord.order_type) === 'delivery'
                            ? 'bg-blue-50 text-blue-700 border-blue-100/50 dark:bg-blue-950/30 dark:text-blue-400'
                            : 'bg-amber-50 text-amber-800 border-amber-100/50 dark:bg-amber-950/30 dark:text-amber-400'
                        }`}>
                          {(ord.orderType || ord.order_type) === 'delivery' ? 'Home Delivery' : 'Takeaway'}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          isDelivered
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50 dark:bg-emerald-950/30 dark:text-emerald-400'
                            : 'bg-red-50 text-red-700 border-red-200/50 dark:bg-red-950/30 dark:text-red-400'
                        }`}>
                          {isDelivered ? '✓ Delivered' : '✕ Rejected'}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-gray-900 dark:text-white">₹{totalAmt.toFixed(2)}</p>
                        <p className="text-[9px] text-gray-400 dark:text-slate-500 font-bold mt-0.5">
                          {new Date(ord.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>

                    {/* Customer info */}
                    <div className="text-xs font-bold text-gray-650 dark:text-slate-350 flex flex-col gap-1.5 bg-slate-50 dark:bg-slate-950/20 p-3 rounded-2xl border border-gray-100 dark:border-slate-800/40">
                      <p className="flex items-center gap-1.5"><User size={13} className="text-gray-400" /> {ord.customerName} ({ord.customerPhone})</p>
                      {(ord.orderType || ord.order_type) === 'delivery' && ord.deliveryAddress && (
                        <p className="flex items-start gap-1.5"><MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" /> {ord.deliveryAddress}</p>
                      )}
                      {(ord.orderType || ord.order_type) === 'takeaway' && ord.pickupTime && (
                        <p className="flex items-center gap-1.5"><Clock size={13} className="text-gray-400" /> Pickup: {ord.pickupTime}</p>
                      )}
                    </div>

                    {/* Items list */}
                    <div className="flex-1 flex flex-col gap-2 pl-1.5">
                      {ord.items.map((item: any, idx: number) => (
                        <div key={idx} className={`flex justify-between items-center text-[11px] font-bold ${
                          isDelivered ? 'text-gray-650 dark:text-slate-300' : 'text-gray-400 dark:text-slate-500 line-through'
                        }`}>
                          <span>{item.menuItem?.name || item.name} <span className={`font-black ${isDelivered ? 'text-emerald-600' : 'text-red-400'}`}>x{item.quantity}</span></span>
                          <span>₹{((item.menuItem?.price || item.price || 0) * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="border-t border-gray-100 dark:border-slate-800/40 pt-2 flex justify-between text-[11px] font-black">
                        <span className="text-gray-500 dark:text-slate-400">{isDelivered ? 'Total Paid' : 'Total (Rejected)'}</span>
                        <span className={isDelivered ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>
                          ₹{totalAmt.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

    </div>
  );
}
