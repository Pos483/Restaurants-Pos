import { useState, useEffect } from 'react';
import { UserPlus, X } from 'lucide-react';
import VirtualKeyboard from './VirtualKeyboard';
import { useToast } from './Toast';
import { db, DBPosCustomer, normalizePhone } from '../db';

interface Props {
  initialName: string;
  initialPhone: string;
  onSave: (name: string, phone: string) => void;
  onClose: () => void;
}

export default function CustomerModal({ initialName, initialPhone, onSave, onClose }: Props) {
  const { showToast } = useToast();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [activeInput, setActiveInput] = useState<'name' | 'phone'>('name');
  const [suggestions, setSuggestions] = useState<DBPosCustomer[]>([]);

  // Auto-fill name from pos_customers when a 10-digit phone is entered
  useEffect(() => {
    const autofill = async () => {
      const clean = normalizePhone(phone);
      if (clean.length === 10) {
        const match = await db.posCustomers.dexieTable.where('phone').equals(clean).first();
        if (match) {
          setName(match.name);
        }
      }
    };
    autofill();
  }, [phone]);

  // Live suggestions from pos_customers table
  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const query = activeInput === 'name' ? name.trim().toLowerCase() : phone.trim();
        const posTable = db.posCustomers.dexieTable;
        if (!query) {
          const list = await posTable.orderBy('lastVisit').reverse().limit(6).toArray();
          setSuggestions(list);
          return;
        }
        let list: DBPosCustomer[] = [];
        if (activeInput === 'name') {
          list = await posTable.filter(c => c.name.toLowerCase().includes(query)).limit(6).toArray();
        } else {
          list = await posTable.filter(c => c.phone.includes(query)).limit(6).toArray();
        }
        setSuggestions(list);
      } catch (err) {
        console.error('Error fetching customer suggestions:', err);
      }
    };
    fetchSuggestions();
  }, [name, phone, activeInput]);


  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-modal rounded-2xl p-6 w-full max-w-2xl max-h-[95vh] overflow-y-auto flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-black text-xl text-gray-800 dark:text-white flex items-center gap-2">
            <UserPlus size={24} className="text-indigo-500" /> Customer Info
          </h3>
          <button title="Close" onClick={onClose} className="p-2 text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <input 
            type="text" 
            placeholder="Customer Name"
            value={name}
            onChange={e => setName(e.target.value)}
            onFocus={() => setActiveInput('name')}
            autoFocus
            className={`flex-1 p-4 border-2 rounded-xl text-base font-bold focus:outline-none transition-colors ${activeInput === 'name' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20' : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800'} dark:text-white dark:placeholder-slate-500`}
          />
          <input 
            type="text" 
            placeholder="Phone Number"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            onFocus={() => setActiveInput('phone')}
            className={`flex-1 p-4 border-2 rounded-xl text-base font-bold focus:outline-none transition-colors ${activeInput === 'phone' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20' : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800'} dark:text-white dark:placeholder-slate-500`}
          />
        </div>

        {/* Customer Suggestions List */}
        {suggestions.length > 0 && (
          <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden flex flex-col bg-gray-50 dark:bg-slate-900 divide-y divide-gray-100 dark:divide-slate-800 shadow-sm max-h-[160px] overflow-y-auto">
            <div className="px-3 py-1.5 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest bg-gray-100 dark:bg-slate-900">
              {name || phone ? 'Matching Saved Customers' : 'Recent Customers (Quick Select)'}
            </div>
            {suggestions.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setName(c.name);
                  setPhone(c.phone);
                  setSuggestions([]);
                }}
                className="px-4 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-slate-800 flex justify-between items-center text-sm font-bold text-gray-700 dark:text-slate-300 transition-colors gap-2"
              >
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-gray-400 dark:text-slate-500 font-semibold text-xs shrink-0">{c.phone}</span>
                <span className="text-[10px] font-black text-indigo-400 dark:text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded-full shrink-0">{c.visitCount || 0} visits</span>
              </button>
            ))}
          </div>
        )}

        {/* Custom Virtual Keyboard */}
        <VirtualKeyboard 
          value={activeInput === 'name' ? name : phone}
          onChange={val => activeInput === 'name' ? setName(val) : setPhone(val)}
          layout={activeInput === 'phone' ? 'numeric' : 'default'}
          onTab={() => setActiveInput(activeInput === 'name' ? 'phone' : 'name')}
        />

        <button onClick={() => {
          const trimmedName = name.trim();
          const cleanPhone = normalizePhone(phone);
          if (cleanPhone && !/^\d{10}$/.test(cleanPhone)) {
            showToast('Phone number must be exactly 10 digits', 'error');
            return;
          }
          onSave(trimmedName, cleanPhone);
        }} className="mt-2 w-full py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 transition-all">
          Save & Close
        </button>
      </div>
    </div>
  );
}
