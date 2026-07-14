import { 
  TrendingUp, 
  IndianRupee, 
  ShoppingBag, 
  AlertCircle, 
  Wallet, 
  Smartphone, 
  CreditCard,
  PieChart
} from 'lucide-react';
import { ReportStats } from '../../utils/reportHelpers';

export const getPaymentIcon = (method: string) => {
  if (method === 'Cash') return <Wallet size={14} />;
  if (method === 'UPI') return <Smartphone size={14} />;
  if (method === 'Unpaid' || method === 'Credit' || method === 'Udhar') return <AlertCircle size={14} />;
  return <CreditCard size={14} />;
};

export const getPaymentColor = (method: string) => {
  if (method === 'Cash') return { bg: 'bg-emerald-500', light: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-600' };
  if (method === 'UPI') return { bg: 'bg-blue-500', light: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-600' };
  if (method === 'Unpaid' || method === 'Credit' || method === 'Udhar') return { bg: 'bg-red-500', light: 'bg-red-50 text-red-700 border-red-200', text: 'text-red-600' };
  if (method === 'Card') return { bg: 'bg-amber-500', light: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-600' };
  return { bg: 'bg-purple-500', light: 'bg-purple-50 text-purple-700 border-purple-200', text: 'text-purple-600' };
};

interface SummaryTabProps {
  backendStats: ReportStats;
}

export default function SummaryTab({ backendStats }: SummaryTabProps) {
  const {
    totalSales,
    totalOrders,
    totalTax,
    totalDiscount,
    totalUnpaid,
    paymentStats
  } = backendStats;

  const grossSales = totalSales + totalUnpaid + totalDiscount;
  const avgBill = totalOrders > 0 ? (totalSales + totalUnpaid) / totalOrders : 0;
  const totalPaymentAmount = Object.values(paymentStats).reduce((a: number, b: any) => a + b, 0) as number;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Gross Sales */}
        <div className="relative bg-gradient-to-br from-purple-600 via-purple-600 to-indigo-700 rounded-2xl p-4 text-white overflow-hidden shadow-lg shadow-purple-200">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
          <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-white/15 rounded-lg backdrop-blur-sm"><TrendingUp size={14} /></div>
              <span className="text-purple-200 font-bold text-xs uppercase tracking-wider">Gross Sales</span>
            </div>
            <div className="text-2xl font-black tracking-tight">₹{grossSales.toFixed(2)}</div>
            <div className="text-purple-200 text-xs font-semibold mt-1">{totalOrders} bills generated</div>
          </div>
        </div>

        {/* Net Sales */}
        <div className="relative bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white overflow-hidden shadow-lg shadow-emerald-200">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-white/15 rounded-lg backdrop-blur-sm"><IndianRupee size={14} /></div>
              <span className="text-emerald-100 font-bold text-xs uppercase tracking-wider">Net Received</span>
            </div>
            <div className="text-2xl font-black tracking-tight">₹{totalSales.toFixed(2)}</div>
            <div className="text-emerald-100 text-xs font-semibold mt-1">After credit deduction</div>
          </div>
        </div>

        {/* Avg Bill */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-orange-100 rounded-lg"><ShoppingBag size={14} className="text-orange-600" /></div>
            <span className="text-gray-400 font-bold text-xs uppercase tracking-wider">Avg Bill</span>
          </div>
          <div className="text-2xl font-black text-gray-800 dark:text-slate-100 tracking-tight">₹{avgBill.toFixed(2)}</div>
          <div className="text-gray-400 text-xs font-semibold mt-1">Per order average</div>
        </div>

        {/* Credit (Udhar) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-red-100 rounded-lg"><AlertCircle size={14} className="text-red-600" /></div>
            <span className="text-gray-400 font-bold text-xs uppercase tracking-wider">Credit (Udhar)</span>
          </div>
          <div className={`text-2xl font-black tracking-tight ${(paymentStats['Credit'] || 0) > 0 ? 'text-red-600' : 'text-gray-800 dark:text-slate-100'}`}>₹{(paymentStats['Credit'] || 0).toFixed(2)}</div>
          <div className="text-gray-400 text-xs font-semibold mt-1">Outstanding credit</div>
        </div>

        {/* Unpaid */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-red-100 rounded-lg"><AlertCircle size={14} className="text-red-600" /></div>
            <span className="text-gray-400 font-bold text-xs uppercase tracking-wider">Unpaid Bills</span>
          </div>
          <div className={`text-2xl font-black tracking-tight ${(paymentStats['Unpaid'] || 0) > 0 ? 'text-red-600' : 'text-gray-800 dark:text-slate-100'}`}>₹{(paymentStats['Unpaid'] || 0).toFixed(2)}</div>
          <div className="text-gray-400 text-xs font-semibold mt-1">Outstanding unpaid</div>
        </div>
      </div>

      {/* Revenue Breakdown + Payment Split */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Revenue Breakdown */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 dark:border-slate-800 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
            <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg"><IndianRupee size={14} className="text-purple-600 dark:text-purple-400" /></div>
            <h2 className="text-sm font-black text-gray-800 dark:text-slate-200">Revenue Breakdown</h2>
          </div>
          <div className="p-5">
            <div className="flex flex-col gap-0">
              {/* Gross */}
              <div className="flex items-center justify-between py-3 border-b border-dashed border-gray-100 dark:border-slate-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <span className="font-bold text-gray-700 dark:text-slate-300 text-sm">Gross Sales (Total Billed)</span>
                </div>
                <span className="font-black text-lg text-gray-900 dark:text-slate-100">₹{grossSales.toFixed(2)}</span>
              </div>
              {/* Discount */}
              <div className="flex items-center justify-between py-3 border-b border-dashed border-gray-100 dark:border-slate-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-rose-400" />
                  <span className="font-semibold text-gray-500 dark:text-slate-400 text-sm">Discount Applied</span>
                </div>
                <span className="font-bold text-rose-500 text-sm">– ₹{totalDiscount.toFixed(2)}</span>
              </div>
              {/* Tax */}
              <div className="flex items-center justify-between py-3 border-b border-dashed border-gray-100 dark:border-slate-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="font-semibold text-gray-500 dark:text-slate-400 text-sm">Tax (GST) Included</span>
                </div>
                <span className="font-bold text-amber-600 text-sm">₹{totalTax.toFixed(2)}</span>
              </div>
              {/* Credit */}
              {(paymentStats['Credit'] || 0) > 0 && (
                <div className="flex items-center justify-between py-3 border-b border-dashed border-gray-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="font-semibold text-red-600 text-sm">Credit (Udhar)</span>
                  </div>
                  <span className="font-bold text-red-600 text-sm">– ₹{(paymentStats['Credit'] || 0).toFixed(2)}</span>
                </div>
              )}
              {/* Unpaid */}
              {(paymentStats['Unpaid'] || 0) > 0 && (
                <div className="flex items-center justify-between py-3 border-b border-dashed border-gray-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    <span className="font-semibold text-orange-600 text-sm">Unpaid Bills</span>
                  </div>
                  <span className="font-bold text-orange-600 text-sm">– ₹{(paymentStats['Unpaid'] || 0).toFixed(2)}</span>
                </div>
              )}
              {/* Net */}
              <div className="flex items-center justify-between py-3 mt-1 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 -mx-5 px-5 rounded-b-xl">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="font-black text-emerald-800 dark:text-emerald-400 text-sm">Net Sales (Received)</span>
                </div>
                <span className="font-black text-xl text-emerald-700 dark:text-emerald-300">₹{totalSales.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Split */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 dark:border-slate-800 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg"><PieChart size={14} className="text-blue-600 dark:text-blue-400" /></div>
            <h2 className="text-sm font-black text-gray-800 dark:text-slate-200">Payment Split</h2>
          </div>
          <div className="p-5 flex flex-col gap-4">
            {Object.entries(paymentStats).length === 0 ? (
              <div className="text-center text-gray-400 font-semibold py-8 text-sm">No payments recorded</div>
            ) : (
              Object.entries(paymentStats)
                .sort(([,a]: any, [,b]: any) => b - a)
                .map(([method, amount]: any) => {
                  const pct = totalPaymentAmount > 0 ? ((amount / totalPaymentAmount) * 100) : 0;
                  const colors = getPaymentColor(method);
                  return (
                    <div key={method}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`p-1 rounded-md border ${colors.light}`}>{getPaymentIcon(method)}</span>
                          <span className="font-bold text-gray-700 dark:text-slate-300 text-sm">{method}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-gray-800 dark:text-slate-200 text-sm">₹{amount.toFixed(2)}</span>
                          <span className="text-gray-400 dark:text-slate-500 text-xs font-semibold ml-1.5">({pct.toFixed(0)}%)</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-slate-900 h-2 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${colors.bg} transition-all duration-700`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
