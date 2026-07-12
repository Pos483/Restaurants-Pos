import { useState, useEffect } from 'react';
import { useLiveQuery, db, recordCustomerPayment, normalizePhone, mergeDuplicateCustomers } from '../db';
import { Search, UserPlus, IndianRupee, Printer, Clock, ArrowUpRight, ArrowDownLeft, User, Phone, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from './Toast';
import { ThermalPrinter } from '../printer';

export default function KhataBook() {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);

  // Add customer form state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newLimit, setNewLimit] = useState('10000');


  // Run a self-healing merge sweep for duplicate customer phone numbers on component mount
  useEffect(() => {
    const runSweep = async () => {
      try {
        const allCustomers = await db.customers.toArray();
        const phoneMap = new Map<string, any[]>();
        
        allCustomers.forEach(c => {
          const cleanPhone = normalizePhone(c.phone);
          if (cleanPhone) {
            const list = phoneMap.get(cleanPhone) || [];
            list.push(c);
            phoneMap.set(cleanPhone, list);
          }
        });

        for (const [phone, list] of phoneMap.entries()) {
          if (list.length > 1) {
            await mergeDuplicateCustomers(phone);
          }
        }
      } catch (err) {
        console.error('[KhataBook] Failed to run database self-healing sweep:', err);
      }
    };
    runSweep();
  }, []);

  const [whatsappCooldowns, setWhatsappCooldowns] = useState<Record<string, number>>({});
  const [whatsappStatusPopup, setWhatsappStatusPopup] = useState<{
    show: boolean;
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    const activeKeys = Object.keys(whatsappCooldowns).filter(id => whatsappCooldowns[id] > 0);
    if (activeKeys.length === 0) return;

    const interval = setInterval(() => {
      setWhatsappCooldowns(prev => {
        const updated = { ...prev };
        let changed = false;
        for (const id of Object.keys(updated)) {
          if (updated[id] > 1) {
            updated[id] -= 1;
            changed = true;
          } else {
            delete updated[id];
            changed = true;
          }
        }
        return changed ? updated : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [whatsappCooldowns]);



  // Repayment form state
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payNote, setPayNote] = useState('');

  // Live queries
  const customers = useLiveQuery(() => db.customers.toArray(), [], 'customers') || [];

  const customerTransactions = useLiveQuery(async () => {
    if (!selectedCustomerId) return [];
    const results = await db.customerTransactions.where('customerId').equals(selectedCustomerId).toArray();
    return results.sort((a, b) => b.timestamp - a.timestamp);
  }, [selectedCustomerId], 'customer_transactions') || [];

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  const customerBills = useLiveQuery(async () => {
    if (!selectedCustomer?.phone) return [];
    const results = await db.bills.where('customerPhone').equals(selectedCustomer.phone).toArray();
    return results.sort((a, b) => b.timestamp - a.timestamp);
  }, [selectedCustomer?.phone], 'bills') || [];

  const globalSettings = useLiveQuery(async () => {
    const profile = await db.restaurantProfile.get('global');
    const sys = await db.restaurantSettings.get('global');
    return { ...(profile || {}), ...(sys || {}) };
  }, [], ['restaurant_profile', 'restaurant_settings']);

  // Filtered customer list
  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm)
  ).sort((a, b) => b.balance - a.balance); // Show highest debtors first

  // Stat computations
  const totalOutstanding = customers.reduce((sum, c) => sum + c.balance, 0);
  const totalDebtors = customers.filter(c => c.balance > 0).length;

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) {
      showToast('Name and Phone Number are required!', 'error');
      return;
    }

    const cleanPhone = normalizePhone(newPhone);
    const phoneExists = customers.some(c => normalizePhone(c.phone) === cleanPhone);
    if (phoneExists) {
      showToast('This phone number is already registered!', 'error');
      return;
    }

    try {
      const id = crypto.randomUUID();
      await db.customers.add({
        id,
        name: newName.trim(),
        phone: cleanPhone,
        creditLimit: Number(newLimit) || 10000,
        balance: 0,
        timestamp: Date.now()
      });
      showToast('Customer added successfully!');
      setSelectedCustomerId(id);
      setShowAddModal(false);
      setNewName('');
      setNewPhone('');
      setNewLimit('10000');
    } catch (err) {
      console.error(err);
      showToast('Failed to add customer. Please try again.', 'error');
    }
  };

  const handleRecordRepayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !payAmount) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid amount!', 'error');
      return;
    }

    if (amount > (selectedCustomer?.balance || 0)) {
      showToast('Repayment amount cannot exceed the outstanding balance!', 'info');
      return; // Block overpayment — do not proceed
    }

    try {
      await recordCustomerPayment(selectedCustomerId, amount, payMethod, payNote);
      showToast('Repayment recorded successfully!');
      setShowPayModal(false);
      setPayAmount('');
      setPayNote('');
    } catch (err) {
      console.error(err);
      showToast('Failed to record repayment. Please try again.', 'error');
    }
  };

  const handlePrintStatement = async () => {
    if (!selectedCustomer) return;
    try {
      await ThermalPrinter.printKhataStatement(selectedCustomer, customerTransactions, globalSettings);
      showToast('Statement printed successfully!');
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Print failed!', 'error');
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 h-full text-gray-900 dark:text-slate-100 overflow-hidden animate-in fade-in duration-300">
      
      {/* LEFT: Customer List & Search */}
      <div className="w-full md:w-[320px] lg:w-[360px] shrink-0 bg-white dark:bg-slate-900/80 rounded-3xl shadow-md border border-gray-100 dark:border-slate-800/80 flex flex-col overflow-hidden transition-colors">
        
        {/* KPI Panel */}
        <div className="p-5 border-b border-gray-100 dark:border-slate-800 bg-gradient-to-br from-orange-50 to-orange-100/30 dark:from-slate-800/40 dark:to-transparent flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xs font-black uppercase text-orange-600 dark:text-orange-400 tracking-wider">Total Outstanding</h2>
            <div className="text-2xl font-black text-gray-800 dark:text-slate-100 mt-1 flex items-center">
              <IndianRupee size={22} className="text-orange-500 mr-0.5" />
              {totalOutstanding.toFixed(2)}
            </div>
            <p className="text-xs text-gray-400 dark:text-slate-500 font-bold mt-1 uppercase">{totalDebtors} Active Accounts</p>
          </div>
          <button 
            onClick={() => setShowAddModal(true)}
            className="p-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-2xl shadow-md shadow-orange-100 dark:shadow-none transition-all duration-200 active:scale-95 flex items-center justify-center cursor-pointer"
            title="Add New Customer"
          >
            <UserPlus size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="p-3.5 border-b border-gray-50 dark:border-slate-800 shrink-0">
          <div className="relative">
            <span className="absolute left-3 top-3.5 text-gray-400 dark:text-slate-500"><Search size={16} /></span>
            <input 
              type="text"
              placeholder="Search by name or phone..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-3 bg-gray-50/60 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-xs font-bold focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 text-gray-800 dark:text-slate-200"
            />
          </div>
        </div>

        {/* Directory List */}
        <div className="flex-1 overflow-auto p-3">
          {filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 dark:text-slate-600 py-8">
              <User size={36} className="opacity-25" />
              <p className="text-xs font-black mt-2">No customers found</p>
            </div>
          ) : (
            filteredCustomers.map(customer => (
              <div 
                key={customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
                className={`p-4 rounded-2xl cursor-pointer mb-2 transition-all border flex items-center justify-between min-w-0 ${
                  selectedCustomerId === customer.id 
                    ? 'bg-orange-50/60 dark:bg-orange-950/20 border-orange-200/80 dark:border-orange-900/50 shadow-sm' 
                    : 'bg-white hover:bg-gray-50 border-transparent dark:bg-slate-900/40 dark:hover:bg-slate-900'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-black text-gray-800 dark:text-slate-200 text-sm truncate">{customer.name}</div>
                  <div className="text-xs text-gray-400 dark:text-slate-500 font-bold mt-1 flex items-center gap-1 min-w-0">
                    <Phone size={10} className="shrink-0" /> <span className="truncate max-w-[140px]">{customer.phone}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {customer.balance > 0 ? (
                    <div className="text-sm font-black text-red-500 dark:text-red-400 max-w-[80px] truncate">₹{customer.balance.toFixed(0)}</div>
                  ) : (
                    <div className="text-xs font-black text-green-500 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-2 py-0.5 rounded-full">Settle</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT: Profile, Logs & Repayments */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedCustomer ? (
          <div className="flex-1 bg-white dark:bg-slate-900/80 rounded-3xl shadow-md border border-gray-100 dark:border-slate-800/80 flex flex-col items-center justify-center p-8 text-center transition-colors">
            <div className="w-16 h-16 rounded-3xl bg-orange-50 dark:bg-slate-800/50 flex items-center justify-center text-orange-500 mb-4 shadow-inner">
              <User size={28} />
            </div>
            <h3 className="text-lg font-black text-gray-800 dark:text-slate-200 mb-1">No Customer Selected</h3>
            <p className="text-sm text-gray-400 dark:text-slate-500 max-w-xs leading-relaxed font-medium">Select a customer from the directory list on the left to manage their profile, record repayments, and view credit transactions.</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden">
            
            {/* Center Profile & Repayment Logs */}
            <div className="flex-1 bg-white dark:bg-slate-900/80 rounded-3xl shadow-md border border-gray-100 dark:border-slate-800/80 flex flex-col overflow-hidden transition-colors">
              
              {/* Profile Card Header */}
              <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 bg-gray-50/50 dark:bg-slate-800/25">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-lg font-black shadow-md shrink-0">
                    {selectedCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-black text-gray-800 dark:text-slate-100 truncate">{selectedCustomer.name}</h2>
                    <p className="text-xs text-gray-400 dark:text-slate-500 font-bold flex items-center gap-1 mt-0.5">
                      <Phone size={11} /> {selectedCustomer.phone}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto shrink-0 flex-wrap">
                  <button 
                    onClick={handlePrintStatement}
                    className="p-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-xl transition-all font-bold text-xs flex items-center justify-center gap-1 border border-gray-200/50 dark:border-slate-700/60 shadow-sm shrink-0 cursor-pointer active:scale-95"
                    title="Print Statement"
                  >
                    <Printer size={15} /> <span className="hidden sm:inline">Print Statement</span>
                  </button>
                  <button 
                    onClick={() => setShowPayModal(true)}
                    disabled={selectedCustomer.balance <= 0}
                    className="flex-1 sm:flex-initial py-2.5 px-4 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl shadow-md shadow-green-100 dark:shadow-none transition-all font-black text-xs flex items-center justify-center gap-1 cursor-pointer active:scale-95 disabled:scale-100 disabled:cursor-not-allowed"
                  >
                    <IndianRupee size={14} /> Record Repayment
                  </button>
                </div>
              </div>

              {/* Transactions Log */}
              <div className="flex-1 overflow-auto p-6">
                <h3 className="text-sm font-black uppercase text-gray-400 dark:text-slate-500 tracking-wider mb-4 flex items-center gap-1.5"><Clock size={14} /> Transaction History</h3>
                
                {customerTransactions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-300 dark:text-slate-700">
                    <Clock size={40} className="opacity-20" />
                    <p className="text-xs font-black mt-2">No transaction logs available</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {customerTransactions.map(t => (
                      <div key={t.id} className="flex items-center justify-between p-4 bg-gray-50/50 hover:bg-gray-50 dark:bg-slate-900/40 dark:hover:bg-slate-900/70 border border-gray-100 dark:border-slate-800/40 rounded-2xl transition-all">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            t.type === 'credit'
                              ? 'bg-red-50 text-red-500 dark:bg-red-950/20 dark:text-red-400' 
                              : 'bg-green-50 text-green-500 dark:bg-green-950/20 dark:text-green-400'
                          }`}>
                            {t.type === 'credit' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                          </div>
                          <div className="min-w-0">
                            <div className="font-black text-gray-800 dark:text-slate-200 text-sm truncate">
                              {t.type === 'credit' ? 'Credit Purchase' : 'Payment Settle'}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-slate-500 font-bold mt-0.5">{formatDate(t.timestamp)}</div>
                            {t.note && (
                              <p className="text-xs text-gray-500 dark:text-slate-400 italic mt-1 font-medium truncate">{t.note}</p>
                            )}
                          </div>
                        </div>
                        <div className={`font-black text-sm shrink-0 max-w-[120px] truncate ${
                          t.type === 'credit' ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400'
                        }`}>
                          {t.type === 'credit' ? '+' : '-'}₹{t.amount.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Unpaid Bills Tally */}
            <div className="w-full lg:w-72 bg-white dark:bg-slate-900/80 rounded-3xl shadow-md border border-gray-100 dark:border-slate-800/80 flex flex-col overflow-hidden transition-colors shrink-0">
              <div className="p-5 border-b border-gray-100 dark:border-slate-800 font-black text-sm uppercase text-gray-700 dark:text-slate-200 tracking-wider shrink-0 bg-gray-50/40 dark:bg-slate-900/20">Outstanding Bills</div>
              <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
                {customerBills.filter(b => b.paymentMethod === 'Credit').length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-gray-300 dark:text-slate-700">
                    <ShieldAlert size={36} className="opacity-20" />
                    <p className="text-xs font-black mt-2">All bills are fully settled!</p>
                  </div>
                ) : (
                  customerBills.filter(b => b.paymentMethod === 'Credit').map(b => (
                    <div key={b.id} className="p-4 border border-red-100 dark:border-red-950/20 bg-gradient-to-r from-red-50/20 to-red-100/5 dark:from-red-950/10 dark:to-transparent rounded-2xl shadow-sm flex justify-between items-center transition-colors">
                      <div>
                        <div className="font-black text-gray-800 dark:text-slate-200 text-[13px]">Bill #{b.billNumber ? b.billNumber.toString().padStart(6, '0') : b.id.slice(-6)}</div>
                        <div className="text-xs text-gray-400 dark:text-slate-500 font-bold mt-1">{formatDate(b.timestamp)}</div>
                      </div>
                      <div className="font-black text-sm text-red-500 dark:text-red-400">₹{b.total.toFixed(0)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
            
          </div>
        )}
      </div>

      {/* MODAL: Add Customer */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="glass-modal bg-white rounded-3xl p-6 shadow-2xl w-full max-w-sm border border-gray-100 dark:bg-slate-900/95 dark:border-slate-800 flex flex-col gap-4 animate-in scale-in duration-200">
            <h3 className="font-black text-xl text-gray-800 dark:text-slate-100">Add New Customer</h3>
            <form onSubmit={handleAddCustomer} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-wide">Customer Name</label>
                <input 
                  type="text" 
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Enter Name"
                  className="p-3.5 bg-gray-50/60 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-gray-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-wide">Phone Number</label>
                <input 
                  type="text" 
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  placeholder="10-Digit Mobile No."
                  className="p-3.5 bg-gray-50/60 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-gray-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-wide">Credit Limit (₹)</label>
                <input 
                  type="number" 
                  value={newLimit}
                  onChange={e => setNewLimit(e.target.value)}
                  placeholder="10000"
                  className="p-3.5 bg-gray-50/60 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-gray-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="flex gap-3.5 mt-2.5">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200/50 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 rounded-2xl font-bold text-sm text-gray-600 dark:text-slate-300 cursor-pointer active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-2xl font-bold text-sm shadow-md shadow-orange-100 dark:shadow-none cursor-pointer active:scale-95"
                >
                  Add Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Record Repayment */}
      {showPayModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="glass-modal bg-white rounded-3xl p-6 shadow-2xl w-full max-w-sm border border-gray-100 dark:bg-slate-900/95 dark:border-slate-800 flex flex-col gap-4 animate-in scale-in duration-200">
            <h3 className="font-black text-xl text-gray-800 dark:text-slate-100">Record Repayment</h3>
            <div className="p-4 bg-orange-50/40 dark:bg-slate-900/40 rounded-2xl border border-orange-100/50 dark:border-slate-800">
              <span className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-wide">Outstanding Balance</span>
              <div className="text-2xl font-black text-red-500 dark:text-red-400 mt-0.5 flex items-center">
                <IndianRupee size={20} className="mr-0.5" />
                {selectedCustomer.balance.toFixed(2)}
              </div>
            </div>
            <form onSubmit={handleRecordRepayment} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-wide">Received Amount (₹)</label>
                <input 
                  type="number" 
                  step="any"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  placeholder="0.00"
                  className="p-3.5 bg-gray-50/60 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm font-black text-gray-800 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-wide">Repayment Method</label>
                <select 
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value)}
                  title="Select Repayment Method"
                  className="p-3.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm font-black text-gray-800 dark:text-slate-100 focus:outline-none cursor-pointer focus:border-orange-500"
                >
                  <option value="Cash">💵 Cash</option>
                  <option value="UPI">📱 UPI</option>
                  <option value="Card">💳 Card</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-wide">Note / Comments</label>
                <input 
                  type="text" 
                  value={payNote}
                  onChange={e => setPayNote(e.target.value)}
                  placeholder="Optional note"
                  className="p-3.5 bg-gray-50/60 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-gray-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="flex gap-3.5 mt-2.5">
                <button 
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="flex-1 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200/50 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 rounded-2xl font-bold text-sm text-gray-600 dark:text-slate-300 cursor-pointer active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-2xl font-bold text-sm shadow-md shadow-green-100 dark:shadow-none cursor-pointer active:scale-95"
                >
                  Record Repay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WhatsApp Status Popup Modal */}
      {whatsappStatusPopup && whatsappStatusPopup.show && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-gray-100 dark:border-slate-800 flex flex-col items-center text-center animate-in scale-in duration-200">
            <div className="mb-4">
              {whatsappStatusPopup.success ? (
                <div className="p-3 bg-green-50 dark:bg-green-950/20 text-green-500 dark:text-green-400 rounded-full animate-bounce">
                  <CheckCircle2 size={48} />
                </div>
              ) : (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-500 dark:text-red-400 rounded-full animate-pulse">
                  <XCircle size={48} />
                </div>
              )}
            </div>
            
            <h4 className="text-xl font-black text-gray-800 dark:text-slate-100 mb-2">
              {whatsappStatusPopup.success ? 'Message Sent!' : 'Delivery Failed'}
            </h4>
            
            <p className="text-sm font-bold text-gray-600 dark:text-slate-400 mb-6 leading-relaxed">
              {whatsappStatusPopup.message}
            </p>
            
            <button
              onClick={() => setWhatsappStatusPopup(null)}
              className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-base shadow-lg shadow-orange-200 dark:shadow-none transition-all active:scale-95"
              title="OK"
            >
              OK
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
