import { useState, useMemo } from 'react';
import { Plus, Trash2, Wallet, IndianRupee } from 'lucide-react';
import { DBExpense } from '../../db/types';
import { db } from '../../db';
import { useToast } from '../Toast';
import ConfirmModal from '../ConfirmModal';
import { fastFormatDate } from '../../utils/reportHelpers';

interface ExpensesTabProps {
  rangeExpenses: DBExpense[];
}

export default function ExpensesTab({ rangeExpenses }: ExpensesTabProps) {
  const { showToast } = useToast();
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [expenseRows, setExpenseRows] = useState<{ amount: string; paymentMethod: string; note: string }[]>([
    { amount: '', paymentMethod: 'Cash', note: '' }
  ]);
  const [expDate, setExpDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const totalExpenses = useMemo(() => {
    return (rangeExpenses || []).reduce((sum, e) => sum + e.amount, 0);
  }, [rangeExpenses]);

  // Expenses Payment Method breakdown
  const expenseMethodsBreakdown = useMemo(() => {
    const methods: Record<string, number> = {
      Cash: 0,
      UPI: 0,
      Card: 0
    };
    rangeExpenses.forEach(e => {
      const pm = e.paymentMethod || 'Cash';
      if (methods[pm] !== undefined) {
        methods[pm] += e.amount;
      } else {
        methods[pm] = (methods[pm] || 0) + e.amount;
      }
    });
    return Object.entries(methods).sort((a, b) => b[1] - a[1]);
  }, [rangeExpenses]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validRows = expenseRows.filter(r => {
      const amt = parseFloat(r.amount);
      return !isNaN(amt) && amt > 0 && r.note.trim().length > 0;
    });

    if (validRows.length === 0) {
      showToast('Please fill in at least one valid expense row with amount and description!', 'error');
      return;
    }

    let timestamp = Date.now();
    if (expDate) {
      const parts = expDate.split('-').map(Number);
      if (parts.length === 3) {
        const now = new Date();
        const expenseDate = new Date(parts[0], parts[1] - 1, parts[2], now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        timestamp = expenseDate.getTime();
      }
    }

    try {
      for (const row of validRows) {
        await db.expenses.add({
          id: crypto.randomUUID(),
          amount: parseFloat(row.amount),
          category: 'Others',
          paymentMethod: row.paymentMethod,
          note: row.note.trim(),
          timestamp: timestamp
        });
      }
      showToast(`${validRows.length} expense(s) successfully logged!`);
      setShowAddExpense(false);
      setExpenseRows([{ amount: '', paymentMethod: 'Cash', note: '' }]);
      const d = new Date();
      setExpDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    } catch (err) {
      console.error(err);
      showToast('Failed to save expenses. Please try again.', 'error');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      await db.expenses.delete(id);
      showToast('Expense deleted successfully!');
    } catch (err) {
      console.error(err);
      showToast('Failed to delete expense.', 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
      
      {/* List block */}
      <div className="lg:col-span-2 bg-white dark:bg-slate-900/80 p-6 rounded-3xl border border-gray-100 dark:border-slate-800/80 flex flex-col overflow-hidden min-h-[50vh] lg:min-h-0">
        <div className="flex justify-between items-center border-b border-gray-50 dark:border-slate-800/80 pb-4 shrink-0">
          <div>
            <h2 className="text-lg font-black text-gray-800 dark:text-slate-100">Expense Tracker</h2>
            <p className="text-xs text-gray-400 dark:text-slate-500 font-bold uppercase mt-1">Range Expenses Log</p>
          </div>
          <button 
            onClick={() => setShowAddExpense(true)}
            className="py-3 px-5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl font-black text-xs shadow-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-purple-100 dark:shadow-none"
          >
            <Plus size={15} /> Log Expenses (Bulk)
          </button>
        </div>

        <div className="flex-1 overflow-auto mt-4 pr-1">
          {rangeExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-gray-300 dark:text-slate-600">
              <Wallet size={48} className="opacity-20 mb-2 animate-pulse" />
              <p className="text-sm font-black">No expenses logged for this range.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {rangeExpenses.map((exp) => (
                <div key={exp.id} className="flex items-center justify-between p-4 bg-gray-50/50 dark:bg-slate-900/40 rounded-2xl hover:bg-gray-50 dark:hover:bg-slate-900/80 transition-all border border-gray-100/50 dark:border-slate-800/40">
                  <div className="min-w-0">
                    <div className="font-black text-gray-800 dark:text-slate-200 text-sm truncate">{exp.note || 'Expense'}</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500 font-bold mt-1.5 uppercase bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full inline-block">
                      {exp.paymentMethod}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-slate-500 font-semibold mt-1">
                      Date: {fastFormatDate(exp.timestamp)}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="font-black text-sm text-rose-500">₹{exp.amount.toFixed(2)}</span>
                    <button 
                      onClick={() => setDeletingExpenseId(exp.id)}
                      className="p-2 text-gray-400 hover:text-red-500 rounded-xl transition-all cursor-pointer active:scale-95 hover:bg-red-50 dark:hover:bg-red-950/20"
                      title="Delete Expense"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expenses Analytics Snapshot */}
      <div className="bg-white dark:bg-slate-900/80 p-6 rounded-3xl border border-gray-100 dark:border-slate-800/80 flex flex-col gap-5">
        <div>
          <h3 className="font-black text-gray-800 dark:text-slate-200 text-base">Expense Analytics</h3>
          <div className="text-2xl font-black text-rose-500 mt-1 flex items-center">
            <IndianRupee size={22} className="mr-0.5" />
            {totalExpenses.toFixed(2)}
          </div>
          <p className="text-xs text-gray-400 dark:text-slate-500 font-bold mt-1 uppercase">Total logged expense</p>
        </div>

        {/* Breakdown progress bars */}
        <div className="flex flex-col gap-4.5 mt-2">
          <h4 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-wider">Breakdown by Payment Method</h4>
          <div className="flex flex-col gap-3">
            {expenseMethodsBreakdown.map(([method, amount]) => {
              const pct = totalExpenses > 0 ? ((amount / totalExpenses) * 100) : 0;
              return (
                <div key={method} className="flex flex-col gap-1">
                  <div className="flex justify-between items-center font-bold text-xs text-gray-600 dark:text-slate-400">
                    <span>{method === 'Cash' ? 'Cash Drawer' : method === 'UPI' ? 'UPI Payment' : 'Credit/Debit Card'}</span>
                    <span className="font-black text-gray-800 dark:text-slate-300">₹{amount.toFixed(2)} <span className="text-xs text-gray-400 font-semibold ml-1">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full transition-all duration-700" 
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add Expense Modal Popup */}
      {showAddExpense && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="glass-modal bg-white rounded-3xl p-6 shadow-2xl w-full max-w-lg border border-gray-100 dark:bg-slate-900/95 dark:border-slate-800 flex flex-col gap-4 animate-in scale-in duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2.5">
              <h3 className="font-black text-lg text-gray-800 dark:text-slate-100">Log Expenses (bulk add)</h3>
              <span className="text-xs font-bold text-gray-400 dark:text-slate-500">{expenseRows.length} Row(s)</span>
            </div>
            
            <form onSubmit={handleAddExpense} className="flex flex-col gap-4">
              {/* Date Picker */}
              <div className="flex flex-col gap-1">
                <label htmlFor="expense-date-input" className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-wide">Expense Date</label>
                <input 
                  id="expense-date-input"
                  type="date" 
                  value={expDate}
                  onChange={e => setExpDate(e.target.value)}
                  title="Expense Date"
                  className="p-2.5 bg-gray-50/60 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-black text-gray-800 dark:text-slate-100 focus:outline-none focus:border-purple-500 w-fit"
                  required
                />
              </div>

              {/* Scrollable Rows Container */}
              <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1 scrollbar-thin">
                {expenseRows.map((row, idx) => (
                  <div key={idx} className="flex items-end gap-2.5 p-3 bg-gray-50/30 dark:bg-slate-800/30 border border-gray-100 dark:border-slate-800/60 rounded-2xl relative group animate-in slide-in-from-bottom-2 duration-150">
                    
                    {/* Description */}
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase">Description / Note</label>
                      <input 
                        type="text" 
                        value={row.note}
                        onChange={e => {
                          const newRows = [...expenseRows];
                          newRows[idx].note = e.target.value;
                          setExpenseRows(newRows);
                        }}
                        placeholder="e.g. Salaries, Milk, Rent"
                        className="p-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-gray-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 w-full"
                        required
                      />
                    </div>

                    {/* Amount */}
                    <div className="w-24 flex flex-col gap-1">
                      <label className="text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase">Amount (₹)</label>
                      <input 
                        type="number" 
                        step="any"
                        value={row.amount}
                        onChange={e => {
                          const newRows = [...expenseRows];
                          newRows[idx].amount = e.target.value;
                          setExpenseRows(newRows);
                        }}
                        placeholder="0.00"
                        className="p-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-black text-gray-800 dark:text-slate-100 focus:outline-none focus:border-purple-500 w-full"
                        required
                      />
                    </div>

                    {/* Payment Method */}
                    <div className="w-28 flex flex-col gap-1">
                      <label className="text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase">Method</label>
                      <select 
                        value={row.paymentMethod}
                        onChange={e => {
                          const newRows = [...expenseRows];
                          newRows[idx].paymentMethod = e.target.value;
                          setExpenseRows(newRows);
                        }}
                        title="Payment Method"
                        className="p-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-gray-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 cursor-pointer"
                      >
                        <option value="Cash">💵 Cash</option>
                        <option value="UPI">📱 UPI</option>
                        <option value="Card">💳 Card</option>
                      </select>
                    </div>

                    {/* Delete button */}
                    {expenseRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setExpenseRows(expenseRows.filter((_, i) => i !== idx));
                        }}
                        title="Remove Row"
                        className="p-2 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/20 rounded-xl transition-all"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add Row Button */}
              <button
                type="button"
                onClick={() => setExpenseRows([...expenseRows, { amount: '', paymentMethod: 'Cash', note: '' }])}
                className="py-2 px-3 self-start border border-dashed border-purple-300 dark:border-purple-900/60 hover:bg-purple-50/50 dark:hover:bg-purple-950/10 text-purple-600 dark:text-purple-400 rounded-2xl text-xs font-black flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Plus size={14} /> Add Row (और खर्च जोड़ें)
              </button>

              {/* Footer Buttons */}
              <div className="flex gap-3.5 mt-2 pt-3 border-t border-gray-100 dark:border-slate-800">
                <button 
                  type="button"
                  onClick={() => {
                    setShowAddExpense(false);
                    setExpenseRows([{ amount: '', paymentMethod: 'Cash', note: '' }]);
                  }}
                  className="flex-1 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200/50 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 rounded-2xl font-bold text-xs text-gray-600 dark:text-slate-300 cursor-pointer active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl font-black text-xs shadow-md shadow-purple-100 dark:shadow-none cursor-pointer active:scale-95"
                >
                  Save All Expenses (सुरक्षित करें)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deletingExpenseId !== null}
        title="Delete Expense"
        message="⚠️ Are you sure you want to delete this expense? This action cannot be undone."
        onConfirm={async () => {
          if (deletingExpenseId) {
            await handleDeleteExpense(deletingExpenseId);
            setDeletingExpenseId(null);
          }
        }}
        onCancel={() => setDeletingExpenseId(null)}
      />

    </div>
  );
}
