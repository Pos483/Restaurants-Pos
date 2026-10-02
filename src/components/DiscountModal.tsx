import { useState } from 'react';
import { Tag, X, Sparkles } from 'lucide-react';
import VirtualKeyboard from './VirtualKeyboard';
import { useToast } from './Toast';

interface Props {
  initialAmount: string;
  initialType: 'amount' | 'percentage';
  onSave: (amount: string, type: 'amount' | 'percentage', manualOverride?: boolean, reason?: string) => void;
  onClose: () => void;
  festivalOffer?: {
    isActive: boolean;
    name: string;
    type: 'amount' | 'percentage';
    value: string | number;
    minOrder?: number;
  };
  currentReason?: string;
}

export default function DiscountModal({ initialAmount, initialType, onSave, onClose, festivalOffer, currentReason }: Props) {
  const { showToast } = useToast();
  const [amount, setAmount] = useState(initialAmount);
  const [type, setType] = useState(initialType);

  const handleApply = () => {
    const val = Number(amount);
    if (amount && (isNaN(val) || val < 0)) {
      showToast('Please enter a valid positive number for discount!', 'error');
      return;
    }
    if (type === 'percentage' && val > 100) {
      showToast('Discount percentage cannot be more than 100%!', 'error');
      return;
    }
    const isFestivalMatching = festivalOffer?.isActive && 
      String(festivalOffer.value) === String(amount) && 
      festivalOffer.type === type;

    onSave(
      amount, 
      type, 
      !isFestivalMatching, 
      isFestivalMatching ? festivalOffer.name : (currentReason && currentReason !== festivalOffer?.name ? currentReason : '')
    );
  };

  const isFestivalActive = Boolean(festivalOffer?.isActive && Number(festivalOffer.value) > 0);

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-modal rounded-3xl p-6 w-full max-w-lg max-h-[95vh] overflow-y-auto flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-black text-xl text-gray-800 dark:text-white flex items-center gap-2">
            <Tag size={24} className="text-indigo-500" /> Apply Discount
          </h3>
          <button onClick={onClose} className="p-2 text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Active Festival Offer Banner */}
        {isFestivalActive && (
          <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-300 dark:border-amber-700/60 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-sm animate-fade-in">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-xl shadow-sm shrink-0">
                <Sparkles size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                  Active Festival Offer
                </div>
                <div className="text-xs font-black text-gray-800 dark:text-slate-100 truncate">
                  {festivalOffer!.name} ({festivalOffer!.value}{festivalOffer!.type === 'percentage' ? '%' : '₹'} OFF)
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onSave(String(festivalOffer!.value), festivalOffer!.type, false, festivalOffer!.name);
              }}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-black text-xs rounded-xl shadow-sm transition-all shrink-0 active:scale-95 cursor-pointer"
            >
              Apply Offer
            </button>
          </div>
        )}
        
        <div className="flex gap-2">
          <select 
            value={type}
            onChange={e => {
              setType(e.target.value as 'amount'|'percentage');
              setAmount('');
            }}
            className="p-4 border-2 border-gray-200 dark:border-slate-700 rounded-xl text-base font-black focus:outline-none focus:border-indigo-500 bg-gray-50 dark:bg-slate-800 cursor-pointer text-gray-700 dark:text-slate-200 w-1/3 transition-colors"
          >
            <option value="amount">Flat (₹)</option>
            <option value="percentage">Percent (%)</option>
          </select>
          <div className="flex-1 flex items-center border-2 border-indigo-500 dark:border-indigo-400 rounded-xl bg-indigo-50 dark:bg-indigo-500/20 px-4 transition-colors">
            <span className="font-black text-gray-500 dark:text-slate-400 mr-2 shrink-0">{type === 'amount' ? '₹' : '%'}</span>
            <input 
              type="text" 
              placeholder="Value"
              value={amount}
              onChange={e => {
                const val = e.target.value.replace(/[^0-9.]/g, '');
                const parts = val.split('.');
                setAmount(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : val);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApply();
                }
              }}
              autoFocus
              className="w-full py-4 text-base font-black focus:outline-none bg-transparent dark:text-white transition-colors"
            />
          </div>
        </div>

        {type === 'percentage' ? (
          <div className="flex justify-between gap-2 pt-1">
            {[5, 10, 15, 20, 25].map(perc => (
              <button 
                key={perc}
                onClick={() => setAmount(perc.toString())}
                className={`flex-1 py-3 px-1 min-h-[44px] rounded-xl text-sm font-bold transition-all border-2 ${amount === perc.toString() ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200 dark:shadow-indigo-900/30' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:border-indigo-300'}`}
              >
                {perc}%
              </button>
            ))}
          </div>
        ) : (
          <div className="flex justify-between gap-2 pt-1">
            {[20, 50, 100, 200, 500].map(flat => (
              <button 
                key={flat}
                onClick={() => setAmount(flat.toString())}
                className={`flex-1 py-3 px-1 min-h-[44px] rounded-xl text-sm font-bold transition-all border-2 ${amount === flat.toString() ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200 dark:shadow-indigo-900/30' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:border-indigo-300'}`}
              >
                ₹{flat}
              </button>
            ))}
          </div>
        )}

        {/* Custom Virtual Keyboard */}
        <VirtualKeyboard 
          value={amount}
          onChange={val => {
            const cleaned = val.replace(/[^0-9.]/g, '');
            const parts = cleaned.split('.');
            setAmount(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned);
          }}
          layout="numeric"
        />

        <div className="flex gap-2 mt-2">
          <button onClick={() => onSave('', type, true, '')} className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded-xl font-bold transition-all cursor-pointer">
            Remove Discount
          </button>
          <button onClick={handleApply} className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 transition-all cursor-pointer">
            Apply Discount
          </button>
        </div>
      </div>
    </div>
  );
}
