import React, { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { DBBill } from '../../db/types';
import { getPaymentColor } from './SummaryTab';

interface DailyTabProps {
  dailyStats: Record<string, { orders: number; subtotal: number; discount: number; tax: number; sales: number; timestamp: number }>;
  billsByDate: Record<string, DBBill[]>;
  formatTime: (ts: number) => string;
}

const DAILY_PAGE_SIZE = 30;

export default function DailyTab({ dailyStats, billsByDate, formatTime }: DailyTabProps) {
  const [dailyPage, setDailyPage] = useState(1);

  const dailyDates = useMemo(() => {
    return Object.keys(dailyStats);
  }, [dailyStats]);

  const pagedDailyDates = useMemo(() => {
    const startIndex = (dailyPage - 1) * DAILY_PAGE_SIZE;
    return dailyDates.slice(startIndex, startIndex + DAILY_PAGE_SIZE);
  }, [dailyDates, dailyPage]);

  const totalDailyPages = useMemo(() => {
    return Math.max(1, Math.ceil(dailyDates.length / DAILY_PAGE_SIZE));
  }, [dailyDates]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 dark:bg-slate-900 dark:border-slate-800 flex flex-col flex-1 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 bg-gradient-to-r from-gray-50 to-white dark:from-slate-800 dark:to-slate-900 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg"><CalendarDays size={14} className="text-blue-600 dark:text-blue-400" /></div>
          <h2 className="text-sm font-black text-gray-800 dark:text-slate-200">Daily Sales Breakdown</h2>
        </div>
        <span className="text-xs font-bold text-gray-400 dark:text-slate-500">{dailyDates.length} day(s)</span>
      </div>

      {totalDailyPages > 1 && (
        <div className="mx-5 my-2 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-amber-900/30">
          ℹ️ Showing page {dailyPage} of {totalDailyPages} ({((dailyPage - 1) * DAILY_PAGE_SIZE) + 1}–{Math.min(dailyPage * DAILY_PAGE_SIZE, dailyDates.length)} of {dailyDates.length} days)
        </div>
      )}

      <div className="flex-1 overflow-x-auto">
        <table className="w-full min-w-[600px] text-left">
          <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10">
            <tr className="text-gray-400 font-bold text-xs uppercase tracking-wider border-b border-gray-100 dark:border-slate-800">
              <th className="py-3 px-5">Bill No</th>
              <th className="py-3 px-4">Time</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Payment</th>
              <th className="py-3 px-4 text-right">Discount</th>
              <th className="py-3 px-5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {pagedDailyDates.map((date) => {
              const stats = dailyStats[date];
              const dateBills = billsByDate[date] || [];
              return (
                <React.Fragment key={date}>
                  <tr className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 border-y border-purple-100/50 dark:border-purple-900/30">
                    <td colSpan={4} className="py-2.5 px-5">
                      <span className="font-black text-purple-800 dark:text-purple-300 text-xs">📅 {date}</span>
                      <span className="text-purple-500 dark:text-purple-400 text-xs font-semibold ml-3">{stats.orders} orders</span>
                    </td>
                    <td className="py-2.5 px-4 text-right text-purple-400 dark:text-purple-300 font-bold text-xs">
                      {stats.discount > 0 && `–₹${stats.discount.toFixed(0)}`}
                    </td>
                    <td className="py-2.5 px-5 text-right font-black text-purple-700 dark:text-purple-300 text-xs">₹{stats.sales.toFixed(2)}</td>
                  </tr>
                  {dateBills.map(bill => (
                    <tr key={bill.id} className="border-b border-gray-50 dark:border-slate-800/60 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-5 pl-8 text-xs font-bold text-gray-400 dark:text-slate-500">#{bill.billNumber || String(bill.id).slice(-6)}</td>
                      <td className="py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-slate-400">{formatTime(bill.timestamp)}</td>
                      <td className="py-2.5 px-4 text-xs text-gray-600 dark:text-slate-300 font-semibold truncate max-w-[150px]" title={bill.customerName || ''}>{bill.customerName || '—'}</td>
                      <td className="py-2.5 px-4">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md border truncate max-w-[150px] inline-block align-middle ${getPaymentColor(bill.paymentMethod.startsWith('Split') ? 'Card' : bill.paymentMethod).light}`} title={bill.paymentMethod}>
                          {bill.paymentMethod}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-rose-400 text-xs">
                        {(bill.discount || 0) > 0 ? `–₹${(bill.discount || 0).toFixed(2)}` : ''}
                      </td>
                      <td className="py-2.5 px-5 text-right font-bold text-gray-800 dark:text-slate-200 text-xs">₹{bill.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
            {pagedDailyDates.length === 0 && (
              <tr><td colSpan={6} className="p-12 text-center text-gray-400 font-semibold">No sales data for selected dates.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalDailyPages > 1 && (
        <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-900/30 shrink-0">
          <span className="text-xs font-bold text-gray-500 dark:text-slate-400">
            Showing {((dailyPage - 1) * DAILY_PAGE_SIZE) + 1} to {Math.min(dailyPage * DAILY_PAGE_SIZE, dailyDates.length)} of {dailyDates.length} days
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={dailyPage === 1}
              onClick={() => setDailyPage(prev => Math.max(1, prev - 1))}
              className="px-3.5 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-black text-xs text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              ◀ Previous
            </button>
            <button
              disabled={dailyPage === totalDailyPages}
              onClick={() => setDailyPage(prev => Math.min(totalDailyPages, prev + 1))}
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
