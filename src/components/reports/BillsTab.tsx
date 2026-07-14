import React, { useMemo } from 'react';
import { Receipt, Ban } from 'lucide-react';
import { DBBill } from '../../db/types';
import { getPaymentColor } from './SummaryTab';

interface BillsTabProps {
  bills: DBBill[];
  billsPage: number;
  setBillsPage: React.Dispatch<React.SetStateAction<number>>;
  formatDate: (ts: number) => string;
  formatTime: (ts: number) => string;
  onCancelClick: (billId: string, billNumberDisplay: string) => void;
}

const BILLS_PAGE_SIZE = 100;

export default function BillsTab({
  bills,
  billsPage,
  setBillsPage,
  formatDate,
  formatTime,
  onCancelClick
}: BillsTabProps) {
  const sortedAllBills = useMemo(() => {
    return [...bills].sort((a, b) => b.timestamp - a.timestamp);
  }, [bills]);

  const pagedBills = useMemo(() => {
    const startIndex = (billsPage - 1) * BILLS_PAGE_SIZE;
    return sortedAllBills.slice(startIndex, startIndex + BILLS_PAGE_SIZE);
  }, [sortedAllBills, billsPage]);

  const totalBillsPages = useMemo(() => {
    return Math.max(1, Math.ceil(bills.length / BILLS_PAGE_SIZE));
  }, [bills]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 dark:bg-slate-900 dark:border-slate-800 flex flex-col flex-1 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 bg-gradient-to-r from-gray-50 to-white dark:from-slate-800 dark:to-slate-900 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg"><Receipt size={14} className="text-purple-600 dark:text-purple-400" /></div>
          <h2 className="text-sm font-black text-gray-800 dark:text-slate-200">Bill Ledger</h2>
        </div>
        <span className="px-3 py-1 bg-purple-50 border border-purple-200 dark:border-purple-800 dark:bg-purple-950/20 rounded-lg text-xs font-bold text-purple-700 dark:text-purple-400">
          {bills.length} total bills
        </span>
      </div>

      {totalBillsPages > 1 && (
        <div className="mx-5 my-2 text-xs font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/20 px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-900/30">
          ℹ️ Showing page {billsPage} of {totalBillsPages} ({((billsPage - 1) * BILLS_PAGE_SIZE) + 1}–{Math.min(billsPage * BILLS_PAGE_SIZE, bills.length)} of {bills.length} bills)
        </div>
      )}

      <div className="flex-1 overflow-x-auto">
        <table className="w-full min-w-[600px] text-left">
          <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10">
            <tr className="text-gray-400 font-bold text-xs uppercase tracking-wider border-b border-gray-100 dark:border-slate-800">
              <th className="py-3 px-5">Bill No</th>
              <th className="py-3 px-4">Date & Time</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Payment</th>
              <th className="py-3 px-4 text-right">Discount</th>
              <th className="py-3 px-5 text-right">Amount</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedBills.map((bill) => {
              const isCancelled = bill.data?.status === 'cancelled';
              return (
                <tr key={bill.id} className={`border-b border-gray-50 dark:border-slate-800/60 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors ${bill.paymentMethod === 'Unpaid' ? 'bg-red-50/30 dark:bg-red-950/10' : ''} ${isCancelled ? 'opacity-60 bg-red-50/10 dark:bg-red-950/5' : ''}`}>
                  <td className="py-3 px-5 font-black text-gray-700 dark:text-slate-400 text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={isCancelled ? 'line-through text-gray-400 dark:text-slate-500' : ''}>
                        #{bill.billNumber || String(bill.id).slice(-6)}
                      </span>
                      {isCancelled && (
                        <span className="bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0">
                          Cancelled
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <div className={`font-bold text-gray-600 dark:text-slate-300 ${isCancelled ? 'line-through text-gray-400 dark:text-slate-500' : ''}`}>{formatDate(bill.timestamp)}</div>
                    <div className="text-gray-400 dark:text-slate-500 font-semibold">{formatTime(bill.timestamp)}</div>
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <div className={`font-bold text-gray-700 dark:text-slate-200 truncate max-w-[150px] ${isCancelled ? 'line-through text-gray-400 dark:text-slate-500' : ''}`} title={bill.customerName || ''}>{bill.customerName || '—'}</div>
                    {bill.customerPhone && <div className="text-gray-400 dark:text-slate-500 font-medium">{bill.customerPhone}</div>}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md border truncate max-w-[150px] inline-block align-middle ${isCancelled ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-200 dark:border-slate-700 line-through' : getPaymentColor(bill.paymentMethod.startsWith('Split') ? 'Card' : bill.paymentMethod).light}`} title={bill.paymentMethod}>
                      {bill.paymentMethod}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-rose-400 text-xs">
                    {(bill.discount || 0) > 0 && !isCancelled ? `–₹${(bill.discount || 0).toFixed(2)}` : ''}
                    {isCancelled && '—'}
                  </td>
                  <td className={`py-3 px-5 text-right font-black text-xs ${isCancelled ? 'line-through text-gray-400 dark:text-slate-500' : 'text-gray-800 dark:text-slate-200'}`}>
                    ₹{bill.total.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {isCancelled ? (
                      <div className="flex flex-col items-center gap-0.5 justify-center">
                        <span className="text-[9px] font-bold text-red-400 uppercase tracking-tighter">Reason:</span>
                        <span className="text-[10px] font-medium text-red-500 dark:text-red-400 max-w-[110px] truncate" title={bill.data?.cancelReason}>
                          {bill.data?.cancelReason || '-'}
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          const billNumDisplay = bill.billNumber ? `#${bill.billNumber}` : `#${bill.id.slice(-6)}`;
                          onCancelClick(bill.id, billNumDisplay);
                        }}
                        className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl font-bold text-[10px] flex items-center gap-1 transition-all border border-red-100 dark:border-red-900/20 active:scale-95 mx-auto cursor-pointer"
                      >
                        <Ban size={10} /> Cancel
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {pagedBills.length === 0 && (
              <tr><td colSpan={7} className="p-12 text-center text-gray-400 font-semibold">No bills found in this range.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalBillsPages > 1 && (
        <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-900/30 shrink-0">
          <span className="text-xs font-bold text-gray-500 dark:text-slate-400">
            Showing {((billsPage - 1) * BILLS_PAGE_SIZE) + 1} to {Math.min(billsPage * BILLS_PAGE_SIZE, bills.length)} of {bills.length} bills
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={billsPage === 1}
              onClick={() => setBillsPage(prev => Math.max(1, prev - 1))}
              className="px-3.5 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-black text-xs text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              ◀ Previous
            </button>
            <button
              disabled={billsPage === totalBillsPages}
              onClick={() => setBillsPage(prev => Math.min(totalBillsPages, prev + 1))}
              className="px-3.5 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-black text-xs text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              Next ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
