import { useState, useMemo, useEffect } from 'react';
import { 
  Coins, 
  Banknote, 
  Printer, 
  FileText, 
  Save, 
  RotateCcw, 
  Trash2, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle2, 
  User, 
  Calendar, 
  FileSpreadsheet,
  Plus,
  Minus
} from 'lucide-react';
import { useLiveQuery, db } from '../../db';
import { useToast } from '../Toast';
import ConfirmModal from '../ConfirmModal';
import { ThermalPrinter } from '../../printer';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DBCounterCash, DBBill, DBExpense } from '../../db/types';

interface CounterCashTabProps {
  bills: DBBill[];
  rangeExpenses: DBExpense[];
  selectedDate: string;
  globalSettings: any;
}

const BIG_NOTE_VALUES = [500, 200, 100, 50] as const;
const SMALL_NOTE_VALUES = [20, 10, 5] as const;
const COIN_VALUES = [20, 10, 5, 2, 1] as const;

export default function CounterCashTab({
  bills,
  rangeExpenses,
  selectedDate,
  globalSettings
}: CounterCashTabProps) {
  const { showToast } = useToast();

  const [date, setDate] = useState(selectedDate || (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }));

  useEffect(() => {
    if (selectedDate) setDate(selectedDate);
  }, [selectedDate]);

  // Denominations State
  const [denominations, setDenominations] = useState({
    notes500: 0,
    notes200: 0,
    notes100: 0,
    notes50: 0,
    notes20: 0,
    notes10: 0,
    notes5: 0,
    coins20: 0,
    coins10: 0,
    coins5: 0,
    coins2: 0,
    coins1: 0,
  });

  const [cashierName, setCashierName] = useState('');
  const [notes, setNotes] = useState('');
  const [isCustomHandover, setIsCustomHandover] = useState(false);
  const [customOwnerAmount, setCustomOwnerAmount] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Active staff list for quick selection
  const staffList = useLiveQuery(async () => {
    try {
      return await db.staff.toArray();
    } catch (_) {
      return [];
    }
  }, [], 'staff') || [];

  // History of past counter cash entries
  const historyEntries = useLiveQuery(async () => {
    try {
      const records = await db.counterCash.toArray();
      return (records || []).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } catch (_) {
      return [];
    }
  }, [], 'counter_cash') || [];

  // Update single denomination count
  const handleCountChange = (key: keyof typeof denominations, val: number) => {
    const cleanVal = Math.max(0, Math.floor(isNaN(val) ? 0 : val));
    setDenominations(prev => ({
      ...prev,
      [key]: cleanVal
    }));
  };

  const incrementCount = (key: keyof typeof denominations) => {
    setDenominations(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
  };

  const decrementCount = (key: keyof typeof denominations) => {
    setDenominations(prev => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) - 1) }));
  };

  const handleReset = () => {
    setDenominations({
      notes500: 0,
      notes200: 0,
      notes100: 0,
      notes50: 0,
      notes20: 0,
      notes10: 0,
      notes5: 0,
      coins20: 0,
      coins10: 0,
      coins5: 0,
      coins2: 0,
      coins1: 0,
    });
    setIsCustomHandover(false);
    setCustomOwnerAmount('');
    setNotes('');
  };

  // Calculations
  const bigNotesTotal = useMemo(() => {
    return (
      (denominations.notes500 * 500) +
      (denominations.notes200 * 200) +
      (denominations.notes100 * 100) +
      (denominations.notes50 * 50)
    );
  }, [denominations]);

  const smallNotesTotal = useMemo(() => {
    return (
      (denominations.notes20 * 20) +
      (denominations.notes10 * 10) +
      (denominations.notes5 * 5)
    );
  }, [denominations]);

  const coinsTotal = useMemo(() => {
    return (
      (denominations.coins20 * 20) +
      (denominations.coins10 * 10) +
      (denominations.coins5 * 5) +
      (denominations.coins2 * 2) +
      (denominations.coins1 * 1)
    );
  }, [denominations]);

  const smallNotesCoinsTotal = smallNotesTotal + coinsTotal;
  const totalCashCounted = bigNotesTotal + smallNotesCoinsTotal;

  const ownerWithdrawal = useMemo(() => {
    if (isCustomHandover && customOwnerAmount !== '') {
      const parsed = parseFloat(customOwnerAmount);
      return isNaN(parsed) ? 0 : parsed;
    }
    return bigNotesTotal;
  }, [isCustomHandover, customOwnerAmount, bigNotesTotal]);

  const counterClosingFloat = Math.max(0, totalCashCounted - ownerWithdrawal);

  // Day's cash sales & cash expenses for selected date
  const dayReconciliation = useMemo(() => {
    // Filter bills for selected date with Cash payment method
    let cashSales = 0;
    (bills || []).forEach(b => {
      if (b.data?.status === 'cancelled') return;
      if (b.paymentMethod === 'Cash') {
        cashSales += b.total || 0;
      }
    });

    // Cash expenses
    let cashExpenses = 0;
    (rangeExpenses || []).forEach(e => {
      const pm = (e.paymentMethod || 'Cash').toLowerCase();
      if (pm === 'cash') {
        cashExpenses += e.amount || 0;
      }
    });

    const expectedCash = Math.max(0, cashSales - cashExpenses);
    const discrepancy = totalCashCounted - expectedCash;

    return {
      cashSales,
      cashExpenses,
      expectedCash,
      discrepancy
    };
  }, [bills, rangeExpenses, totalCashCounted]);

  // Save current entry to local DB
  const handleSaveEntry = async () => {
    if (totalCashCounted <= 0) {
      showToast('Please enter at least one note or coin count before saving!', 'error');
      return;
    }

    setSaving(true);
    try {
      const newEntry: DBCounterCash = {
        id: crypto.randomUUID(),
        date,
        timestamp: Date.now(),
        cashierName: cashierName.trim() || undefined,
        ...denominations,
        totalCash: totalCashCounted,
        bigNotesTotal,
        smallNotesCoinsTotal,
        ownerWithdrawal,
        counterClosingFloat,
        expectedCash: dayReconciliation.expectedCash,
        discrepancy: dayReconciliation.discrepancy,
        notes: notes.trim() || undefined
      };

      await db.counterCash.add(newEntry);
      showToast('Counter Cash Closing saved successfully!');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to save counter cash record', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Delete an entry from history
  const handleDeleteEntry = async () => {
    if (!deletingId) return;
    try {
      await db.counterCash.delete(deletingId);
      showToast('Entry deleted successfully!');
      setDeletingId(null);
    } catch (err: any) {
      console.error(err);
      showToast('Failed to delete entry', 'error');
    }
  };

  // Print Slip to Thermal Printer
  const handlePrintSlip = async (entryData?: DBCounterCash) => {
    const dataToPrint = entryData || {
      id: 'current',
      date,
      timestamp: Date.now(),
      cashierName: cashierName.trim() || undefined,
      ...denominations,
      totalCash: totalCashCounted,
      bigNotesTotal,
      smallNotesCoinsTotal,
      ownerWithdrawal,
      counterClosingFloat,
      expectedCash: dayReconciliation.expectedCash,
      discrepancy: dayReconciliation.discrepancy,
      notes: notes.trim() || undefined
    };

    try {
      await ThermalPrinter.printCounterCashSlip(dataToPrint, globalSettings);
      showToast('Counter cash slip printed successfully!');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Printer not connected or failed to print.', 'error');
    }
  };

  // Generate and download PDF slip
  const handleDownloadPDF = (entryData?: DBCounterCash) => {
    try {
      const data = entryData || {
        id: 'current',
        date,
        timestamp: Date.now(),
        cashierName: cashierName.trim() || 'Cashier',
        ...denominations,
        totalCash: totalCashCounted,
        bigNotesTotal,
        smallNotesCoinsTotal,
        ownerWithdrawal,
        counterClosingFloat,
        expectedCash: dayReconciliation.expectedCash,
        discrepancy: dayReconciliation.discrepancy,
        notes: notes.trim() || undefined
      };

      const doc = new jsPDF({ unit: 'mm', format: [80, 210] }); // 80mm thermal slip format
      const restaurantName = globalSettings?.restaurantName || 'RESTAURANT POS';

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(restaurantName, 40, 10, { align: 'center' });

      doc.setFontSize(10);
      doc.text('COUNTER CASH & COIN CLOSING', 40, 16, { align: 'center' });

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Date: ${data.date}`, 5, 23);
      doc.text(`Time: ${new Date(data.timestamp).toLocaleTimeString()}`, 5, 27);
      if (data.cashierName) {
        doc.text(`Cashier: ${data.cashierName}`, 5, 31);
      }

      const rows: string[][] = [];

      // Big Notes
      if (data.notes500 > 0) rows.push(['Rs 500 Note', `x ${data.notes500}`, `Rs ${data.notes500 * 500}`]);
      if (data.notes200 > 0) rows.push(['Rs 200 Note', `x ${data.notes200}`, `Rs ${data.notes200 * 200}`]);
      if (data.notes100 > 0) rows.push(['Rs 100 Note', `x ${data.notes100}`, `Rs ${data.notes100 * 100}`]);
      if (data.notes50 > 0) rows.push(['Rs 50 Note', `x ${data.notes50}`, `Rs ${data.notes50 * 50}`]);

      // Small Notes
      if (data.notes20 > 0) rows.push(['Rs 20 Note', `x ${data.notes20}`, `Rs ${data.notes20 * 20}`]);
      if (data.notes10 > 0) rows.push(['Rs 10 Note', `x ${data.notes10}`, `Rs ${data.notes10 * 10}`]);
      if (data.notes5 > 0) rows.push(['Rs 5 Note', `x ${data.notes5}`, `Rs ${data.notes5 * 5}`]);

      // Coins
      if (data.coins20 > 0) rows.push(['Rs 20 Coin', `x ${data.coins20}`, `Rs ${data.coins20 * 20}`]);
      if (data.coins10 > 0) rows.push(['Rs 10 Coin', `x ${data.coins10}`, `Rs ${data.coins10 * 10}`]);
      if (data.coins5 > 0) rows.push(['Rs 5 Coin', `x ${data.coins5}`, `Rs ${data.coins5 * 5}`]);
      if (data.coins2 > 0) rows.push(['Rs 2 Coin', `x ${data.coins2}`, `Rs ${data.coins2 * 2}`]);
      if (data.coins1 > 0) rows.push(['Rs 1 Coin', `x ${data.coins1}`, `Rs ${data.coins1 * 1}`]);

      autoTable(doc, {
        head: [['Denomination', 'Qty', 'Amount']],
        body: rows,
        startY: 35,
        theme: 'plain',
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fontStyle: 'bold', fillColor: [240, 240, 240] }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`TOTAL COUNTED: Rs ${Number(data.totalCash).toFixed(0)}`, 5, finalY);
      doc.setFontSize(8);
      doc.text(`Owner Takeaway (Big Notes): Rs ${Number(data.ownerWithdrawal).toFixed(0)}`, 5, finalY + 5);
      doc.text(`Counter Float Left: Rs ${Number(data.counterClosingFloat).toFixed(0)}`, 5, finalY + 10);

      let currentY = finalY + 16;
      if (data.expectedCash !== undefined) {
        doc.setFont('helvetica', 'normal');
        doc.text(`Expected Cash: Rs ${Number(data.expectedCash).toFixed(0)}`, 5, currentY);
        const diff = Number(data.discrepancy || 0);
        const diffStr = diff === 0 ? 'Match (Rs 0)' : diff > 0 ? `Surplus (+Rs ${diff})` : `Short (-Rs ${Math.abs(diff)})`;
        doc.text(`Variance: ${diffStr}`, 5, currentY + 4);
        currentY += 10;
      }

      if (data.notes) {
        doc.text(`Note: ${data.notes}`, 5, currentY);
        currentY += 6;
      }

      currentY += 8;
      doc.setFont('helvetica', 'normal');
      doc.text('Owner Sign: ____________', 5, currentY);
      doc.text('Cashier Sign: ____________', 45, currentY);

      doc.save(`counter_cash_${data.date}.pdf`);
      showToast('PDF downloaded successfully!');
    } catch (err) {
      console.error('PDF error:', err);
      showToast('Failed to generate PDF', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-200">
      {/* ── TOP BANNER & DESCRIPTION ── */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-purple-950/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-purple-500/20 text-purple-300 rounded-xl border border-purple-400/20">
              <Coins size={20} />
            </span>
            <h2 className="text-xl font-black tracking-tight">Counter Cash & Coin Closing Register</h2>
          </div>
          <p className="text-xs text-purple-200/80 font-medium mt-1.5 max-w-2xl leading-relaxed">
            Night closing cash drawer tally (गल्ला क्लोजिंग): Separate large notes (<strong>₹500, ₹200, ₹100, ₹50</strong>) for the owner pickup, and preserve small notes & coins (<strong>₹20, ₹10, ₹5 notes + coins</strong>) in the counter for next morning's opening float.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleReset}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 border border-white/10"
          >
            <RotateCcw size={14} /> Clear / Reset
          </button>
          <button
            onClick={() => handlePrintSlip()}
            disabled={totalCashCounted <= 0}
            className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-orange-950/40 disabled:opacity-50 disabled:pointer-events-none active:scale-95"
          >
            <Printer size={14} /> Print Slip
          </button>
          <button
            onClick={() => handleDownloadPDF()}
            disabled={totalCashCounted <= 0}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-indigo-950/40 disabled:opacity-50 disabled:pointer-events-none active:scale-95"
          >
            <FileText size={14} /> PDF Slip
          </button>
        </div>
      </div>

      {/* ── KPI METRICS CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Counted */}
        <div className="bg-white dark:bg-slate-900/80 p-5 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-wider">
              Total Cash in Drawer
            </span>
            <span className="p-2 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl">
              <Banknote size={16} />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-gray-900 dark:text-slate-100 tracking-tight">
              ₹{totalCashCounted.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 mt-0.5">
              All notes & coins counted
            </p>
          </div>
        </div>

        {/* Card 2: Owner Pickup (Big Notes) */}
        <div className="bg-white dark:bg-slate-900/80 p-5 rounded-3xl border border-amber-100 dark:border-amber-950/30 shadow-sm bg-gradient-to-br from-amber-50/30 to-transparent dark:from-amber-950/10 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                Owner Takeaway (बड़े नोट)
              </span>
              <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 rounded text-[9px] font-black uppercase">
                Pickup
              </span>
            </div>
            <span className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
              <User size={16} />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight">
              ₹{ownerWithdrawal.toLocaleString('en-IN')}
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">
                ₹500, ₹200, ₹100, ₹50 notes
              </span>
              <button
                type="button"
                onClick={() => setIsCustomHandover(!isCustomHandover)}
                className="text-[10px] font-bold text-amber-700 dark:text-amber-400 hover:underline"
              >
                {isCustomHandover ? 'Use Auto' : 'Customize'}
              </button>
            </div>
            {isCustomHandover && (
              <div className="mt-2 pt-2 border-t border-amber-100 dark:border-amber-950/40">
                <input
                  type="number"
                  placeholder="Custom Owner Amount"
                  value={customOwnerAmount}
                  onChange={(e) => setCustomOwnerAmount(e.target.value)}
                  className="w-full text-xs font-bold px-2 py-1 border border-amber-200 dark:border-amber-900 rounded-lg bg-white dark:bg-slate-950 text-gray-800 dark:text-slate-100 focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Counter Float / Change (Small Notes & Coins) */}
        <div className="bg-white dark:bg-slate-900/80 p-5 rounded-3xl border border-emerald-100 dark:border-emerald-950/30 shadow-sm bg-gradient-to-br from-emerald-50/30 to-transparent dark:from-emerald-950/10 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Counter Float (गल्ले में चेंज)
              </span>
              <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 rounded text-[9px] font-black uppercase">
                Next Day
              </span>
            </div>
            <span className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Coins size={16} />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
              ₹{counterClosingFloat.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mt-0.5">
              Left in drawer (₹20, ₹10 + coins)
            </p>
          </div>
        </div>

        {/* Card 4: Day Reconciliation */}
        <div className="bg-white dark:bg-slate-900/80 p-5 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-wider">
              Cash Drawer Tally
            </span>
            <span className={`p-2 rounded-xl ${
              dayReconciliation.discrepancy === 0 
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                : dayReconciliation.discrepancy > 0 
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400'
                : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
            }`}>
              {dayReconciliation.discrepancy === 0 ? <CheckCircle2 size={16} /> : dayReconciliation.discrepancy > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-black tracking-tight ${
                dayReconciliation.discrepancy === 0 ? 'text-emerald-600 dark:text-emerald-400' : dayReconciliation.discrepancy > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600'
              }`}>
                {dayReconciliation.discrepancy === 0 ? '₹0' : `${dayReconciliation.discrepancy > 0 ? '+' : ''}₹${dayReconciliation.discrepancy.toLocaleString('en-IN')}`}
              </span>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400">
                {dayReconciliation.discrepancy === 0 ? 'Exact Match' : dayReconciliation.discrepancy > 0 ? 'Surplus Cash' : 'Cash Short'}
              </span>
            </div>
            <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 mt-0.5">
              Expected: ₹{dayReconciliation.expectedCash.toLocaleString('en-IN')} (Sales ₹{dayReconciliation.cashSales} - Exp ₹{dayReconciliation.cashExpenses})
            </p>
          </div>
        </div>
      </div>

      {/* ── MAIN WORKSPACE: DENOMINATION COUNTER & ACTIONS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Notes and Coins Input Grid */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* 1. Large Notes Section (Owner Takes) */}
          <div className="bg-white dark:bg-slate-900/80 rounded-3xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800/80 mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-sm shadow-md shadow-amber-200 dark:shadow-none">
                  ₹
                </div>
                <div>
                  <h3 className="font-black text-sm text-gray-900 dark:text-slate-100">
                    Large Notes (बड़े नोट - Owner Pickup)
                  </h3>
                  <p className="text-xs text-gray-400 dark:text-slate-500 font-semibold">
                    These notes are normally handed over to the restaurant owner at day closing
                  </p>
                </div>
              </div>
              <span className="text-sm font-black text-amber-600 dark:text-amber-400">
                Total: ₹{bigNotesTotal.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {BIG_NOTE_VALUES.map(val => {
                const key = `notes${val}` as keyof typeof denominations;
                const count = denominations[key];
                const subtotal = count * val;

                return (
                  <div 
                    key={val}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                      count > 0 
                        ? 'border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10' 
                        : 'border-gray-100 bg-gray-50/40 dark:border-slate-800 dark:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-10 rounded-xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/40 flex flex-col items-center justify-center shrink-0">
                        <span className="text-xs font-black text-amber-700 dark:text-amber-400">₹{val}</span>
                        <span className="text-[8px] font-bold text-amber-600/70 dark:text-amber-500">Note</span>
                      </div>
                      <div>
                        <span className="text-xs font-bold text-gray-400 dark:text-slate-500">Subtotal:</span>
                        <div className="text-sm font-black text-gray-800 dark:text-slate-200">
                          ₹{subtotal.toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => decrementCount(key)}
                        disabled={count <= 0}
                        className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-gray-600 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={count === 0 ? '' : count}
                        placeholder="0"
                        onChange={(e) => handleCountChange(key, parseInt(e.target.value, 10))}
                        className="w-14 h-8 text-center text-sm font-black bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => incrementCount(key)}
                        className="w-8 h-8 rounded-lg bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center shadow-sm shadow-amber-200 dark:shadow-none transition-all active:scale-95"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Small Notes & Coins Section (Left in Counter) */}
          <div className="bg-white dark:bg-slate-900/80 rounded-3xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800/80 mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black text-sm shadow-md shadow-emerald-200 dark:shadow-none">
                  <Coins size={16} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-gray-900 dark:text-slate-100">
                    Small Notes & Coins (छोटे नोट व सिक्के - Counter Float)
                  </h3>
                  <p className="text-xs text-gray-400 dark:text-slate-500 font-semibold">
                    Kept in the drawer for tomorrow's opening change (गल्ले में छोड़ा गया चेंज)
                  </p>
                </div>
              </div>
              <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                Total: ₹{smallNotesCoinsTotal.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Small Notes */}
            <div className="mb-4">
              <span className="text-[10px] font-black uppercase text-gray-400 dark:text-slate-500 tracking-wider mb-3 block">
                Small Notes (छोटे नोट)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {SMALL_NOTE_VALUES.map(val => {
                  const key = `notes${val}` as keyof typeof denominations;
                  const count = denominations[key];
                  const subtotal = count * val;

                  return (
                    <div 
                      key={val}
                      className={`p-3 rounded-2xl border transition-all flex flex-col gap-2 ${
                        count > 0 
                          ? 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/10' 
                          : 'border-gray-100 bg-gray-50/40 dark:border-slate-800 dark:bg-slate-900/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-black text-xs">
                          ₹{val} Note
                        </span>
                        <span className="text-xs font-black text-gray-700 dark:text-slate-300">
                          ₹{subtotal}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-1 mt-1">
                        <button
                          type="button"
                          onClick={() => decrementCount(key)}
                          disabled={count <= 0}
                          className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-slate-300 flex items-center justify-center disabled:opacity-30"
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={count === 0 ? '' : count}
                          placeholder="0"
                          onChange={(e) => handleCountChange(key, parseInt(e.target.value, 10))}
                          className="w-14 h-7 text-center text-xs font-black bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-100 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => incrementCount(key)}
                          className="w-7 h-7 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Coins */}
            <div>
              <span className="text-[10px] font-black uppercase text-gray-400 dark:text-slate-500 tracking-wider mb-3 block">
                Coins (सिक्के)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {COIN_VALUES.map(val => {
                  const key = `coins${val}` as keyof typeof denominations;
                  const count = denominations[key];
                  const subtotal = count * val;

                  return (
                    <div 
                      key={val}
                      className={`p-3 rounded-2xl border transition-all flex flex-col gap-2 ${
                        count > 0 
                          ? 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/10' 
                          : 'border-gray-100 bg-gray-50/40 dark:border-slate-800 dark:bg-slate-900/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-6 h-6 rounded-full border border-emerald-300 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-[10px] font-black text-emerald-800 dark:text-emerald-300">
                          ₹{val}
                        </div>
                        <span className="text-[11px] font-black text-gray-700 dark:text-slate-300">
                          ₹{subtotal}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-1 mt-1">
                        <button
                          type="button"
                          onClick={() => decrementCount(key)}
                          disabled={count <= 0}
                          className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-slate-300 flex items-center justify-center disabled:opacity-30"
                        >
                          <Minus size={10} />
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={count === 0 ? '' : count}
                          placeholder="0"
                          onChange={(e) => handleCountChange(key, parseInt(e.target.value, 10))}
                          className="w-10 h-6 text-center text-xs font-black bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-100 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => incrementCount(key)}
                          className="w-6 h-6 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center"
                        >
                          <Plus size={10} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Closing Form, Details & Save */}
        <div className="flex flex-col gap-6">
          <div className="bg-white dark:bg-slate-900/80 rounded-3xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm flex flex-col gap-4">
            <h3 className="font-black text-sm text-gray-800 dark:text-slate-100 pb-3 border-b border-gray-100 dark:border-slate-800">
              Closing Details & Handover
            </h3>

            {/* Date Picker */}
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Calendar size={13} /> Closing Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-800 dark:text-slate-100 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Cashier / Manager Name */}
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <User size={13} /> Cashier / Staff Name
              </label>
              {staffList.length > 0 ? (
                <div className="flex gap-2">
                  <select
                    value={cashierName}
                    onChange={(e) => setCashierName(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 dark:text-slate-100 focus:outline-none focus:border-purple-500"
                  >
                    <option value="">Select Cashier / Staff</option>
                    {staffList.map((s) => (
                      <option key={s.id} value={s.name}>{s.name} ({s.role})</option>
                    ))}
                    <option value="custom">-- Type Custom Name --</option>
                  </select>
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="Enter Cashier Name..."
                  value={cashierName}
                  onChange={(e) => setCashierName(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-bold text-gray-800 dark:text-slate-100 focus:outline-none focus:border-purple-500"
                />
              )}
              {cashierName === 'custom' && (
                <input
                  type="text"
                  placeholder="Type staff name here..."
                  onChange={(e) => setCashierName(e.target.value)}
                  className="w-full mt-2 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-bold text-gray-800 dark:text-slate-100 focus:outline-none focus:border-purple-500"
                />
              )}
            </div>

            {/* Remarks / Notes */}
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-1.5 block">
                Handover Notes / Remarks
              </label>
              <textarea
                placeholder="Example: Handed Rs 24,000 to Owner. Left Rs 1,480 in counter drawer for morning float..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-medium text-gray-800 dark:text-slate-100 focus:outline-none focus:border-purple-500 h-20 resize-none"
              />
            </div>

            {/* Breakdown Summary Box */}
            <div className="bg-gray-50 dark:bg-slate-950 p-4 rounded-2xl border border-gray-100 dark:border-slate-800/80 flex flex-col gap-2.5 text-xs">
              <div className="flex justify-between items-center text-gray-500 dark:text-slate-400 font-semibold">
                <span>Total Cash Counted</span>
                <span className="font-black text-gray-900 dark:text-slate-100">₹{totalCashCounted.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center text-amber-600 dark:text-amber-400 font-bold">
                <span>Owner Handover (Big Notes)</span>
                <span className="font-black">₹{ownerWithdrawal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-bold border-t border-gray-200/60 dark:border-slate-800 pt-2">
                <span>Counter Change Kept</span>
                <span className="font-black">₹{counterClosingFloat.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Save Button */}
            <button
              type="button"
              onClick={handleSaveEntry}
              disabled={saving || totalCashCounted <= 0}
              className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl font-black text-xs shadow-lg shadow-purple-200 dark:shadow-none flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save size={15} /> Save Closing Entry
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── CLOSING HISTORY TABLE ── */}
      <div className="bg-white dark:bg-slate-900/80 rounded-3xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl">
              <FileSpreadsheet size={16} />
            </span>
            <div>
              <h3 className="font-black text-sm text-gray-800 dark:text-slate-100">
                Past Counter Cash Closing History
              </h3>
              <p className="text-xs text-gray-400 dark:text-slate-500 font-semibold">
                Saved daily cash register handovers and counter float records
              </p>
            </div>
          </div>
          <span className="px-3 py-1 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 font-bold text-xs rounded-lg">
            {historyEntries.length} saved records
          </span>
        </div>

        {historyEntries.length === 0 ? (
          <div className="py-12 text-center text-gray-400 dark:text-slate-600 font-semibold text-xs flex flex-col items-center gap-2">
            <Coins size={32} className="opacity-20" />
            No counter cash entries saved yet. Count the drawer and click "Save Closing Entry".
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-slate-900/20 text-gray-400 font-bold text-xs uppercase tracking-wider border-b border-gray-100 dark:border-slate-800">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Cashier</th>
                  <th className="py-3 px-4 text-right">Total Counted</th>
                  <th className="py-3 px-4 text-right text-amber-600 dark:text-amber-400">Owner Took</th>
                  <th className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">Counter Float</th>
                  <th className="py-3 px-4 text-center">Tally Diff</th>
                  <th className="py-3 px-4">Notes</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                {historyEntries.map((entry) => {
                  const diff = entry.discrepancy;
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50/40 dark:hover:bg-slate-800/30 transition-all text-xs font-bold text-gray-700 dark:text-slate-300">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-black text-gray-800 dark:text-slate-200">{entry.date}</div>
                        <div className="text-[10px] text-gray-400 dark:text-slate-500">
                          {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {entry.cashierName || '-'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-gray-900 dark:text-slate-100 whitespace-nowrap">
                        ₹{Number(entry.totalCash || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-amber-600 dark:text-amber-400 whitespace-nowrap">
                        ₹{Number(entry.ownerWithdrawal || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        ₹{Number(entry.counterClosingFloat || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {diff === undefined || diff === null ? (
                          <span className="text-gray-400">-</span>
                        ) : diff === 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 text-[10px] font-black">
                            Match
                          </span>
                        ) : diff > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 text-[10px] font-black">
                            +₹{diff}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 text-[10px] font-black">
                            -₹{Math.abs(diff)}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 max-w-[180px] truncate text-gray-500 dark:text-slate-400 font-normal">
                        {entry.notes || '-'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handlePrintSlip(entry)}
                            title="Print Thermal Slip"
                            className="p-1.5 hover:bg-orange-50 text-gray-500 hover:text-orange-600 dark:hover:bg-slate-800 dark:hover:text-orange-400 rounded-lg transition-all"
                          >
                            <Printer size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadPDF(entry)}
                            title="Download PDF"
                            className="p-1.5 hover:bg-indigo-50 text-gray-500 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 rounded-lg transition-all"
                          >
                            <FileText size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(entry.id)}
                            title="Delete Entry"
                            className="p-1.5 hover:bg-red-50 text-gray-500 hover:text-red-500 dark:hover:bg-slate-800 dark:hover:text-red-400 rounded-lg transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <ConfirmModal
          isOpen={true}
          title="Delete Counter Cash Entry"
          message="Are you sure you want to delete this cash closing entry? This action cannot be undone."
          onConfirm={handleDeleteEntry}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}
