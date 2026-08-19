import { useState, useEffect } from 'react';
import { UserPlus, X, User, Check, Keyboard, Phone, ArrowRight, Star } from 'lucide-react';
import VirtualKeyboard from './VirtualKeyboard';
import { useToast } from './Toast';
import { normalizePhone, searchCustomersUnified, findCustomerByPhone, CustomerSearchResult } from '../db';

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
  const [suggestions, setSuggestions] = useState<CustomerSearchResult[]>([]);
  const [showKeyboard, setShowKeyboard] = useState<boolean>(false);

  // Auto-fill name when phone reaches 10 digits
  useEffect(() => {
    const autofill = async () => {
      const clean = normalizePhone(phone);
      if (clean.length === 10) {
        const match = await findCustomerByPhone(clean);
        if (match && match.name) {
          setName(match.name);
        }
      }
    };
    autofill();
  }, [phone]);

  // Live unified suggestions from both posCustomers & customers databases
  useEffect(() => {
    let isMounted = true;
    const fetchSuggestions = async () => {
      try {
        const query = activeInput === 'name' ? name : phone;
        const list = await searchCustomersUnified(query, 10);
        if (isMounted) {
          setSuggestions(list);
        }
      } catch (err) {
        console.error('Error fetching customer suggestions:', err);
      }
    };
    fetchSuggestions();
    return () => {
      isMounted = false;
    };
  }, [name, phone, activeInput]);

  const handleSelectCustomer = (c: CustomerSearchResult) => {
    setName(c.name);
    setPhone(c.phone);
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    const cleanPhone = normalizePhone(phone);
    if (cleanPhone && cleanPhone.length > 0 && cleanPhone.length < 10) {
      showToast('Phone number must be at least 10 digits', 'error');
      return;
    }
    onSave(trimmedName, cleanPhone);
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 w-full max-w-lg max-h-[96vh] flex flex-col gap-3 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200 overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
              <UserPlus size={18} />
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-900 dark:text-slate-100">Customer Details</h3>
              <p className="text-[11px] text-slate-400 font-medium">Select a saved customer or enter new customer details</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowKeyboard(!showKeyboard)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                showKeyboard
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
              }`}
              title="Toggle On-Screen Keyboard"
            >
              <Keyboard size={14} />
              <span className="text-[11px]">{showKeyboard ? 'Hide' : 'Keyboard'}</span>
            </button>

            <button 
              title="Close" 
              onClick={onClose} 
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        
        {/* Input Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 shrink-0">
          <div>
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-0.5">Customer Name</label>
            <input 
              type="text" 
              placeholder="e.g. Rahul Sharma"
              value={name}
              onChange={e => setName(e.target.value)}
              onFocus={() => setActiveInput('name')}
              autoFocus
              className={`w-full px-3.5 py-2 border rounded-xl text-xs font-bold focus:outline-none transition-all ${
                activeInput === 'name' 
                  ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30 text-indigo-950 dark:text-white' 
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-slate-900 dark:text-white'
              }`}
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-0.5">Mobile Number</label>
            <input 
              type="tel" 
              placeholder="10-digit mobile"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onFocus={() => setActiveInput('phone')}
              className={`w-full px-3.5 py-2 border rounded-xl text-xs font-bold focus:outline-none transition-all ${
                activeInput === 'phone' 
                  ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30 text-indigo-950 dark:text-white' 
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-slate-900 dark:text-white'
              }`}
            />
          </div>
        </div>

        {/* ── CUSTOMER SUGGESTIONS CONTAINER ────────────────────────────────── */}
        <div className={`flex-1 ${showKeyboard ? 'h-[105px] min-h-[90px]' : 'h-[240px] min-h-[160px]'} flex flex-col overflow-hidden border border-indigo-100/80 dark:border-slate-800 rounded-xl bg-slate-50/60 dark:bg-slate-950/50 shadow-inner transition-all`}>
          
          <div className="px-3 py-1.5 text-[10px] font-black text-indigo-700 dark:text-indigo-400 bg-indigo-50/90 dark:bg-slate-800/90 flex items-center justify-between border-b border-indigo-100 dark:border-slate-800 shrink-0">
            <span className="flex items-center gap-1">
              <Star size={12} className="text-amber-500 fill-amber-500" />
              {name || phone ? 'Matching Saved Customers' : 'Saved Customer Suggestions (Click to Select)'}
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-700">
              {suggestions.length} available
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-1">
            {suggestions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-3 text-center text-slate-400">
                <User size={22} className="opacity-30 mb-1" />
                <p className="text-xs font-bold text-slate-500">No matching customer found in database</p>
              </div>
            ) : (
              suggestions.map(c => {
                const isSelected = name.trim().toLowerCase() === c.name.trim().toLowerCase() && phone === c.phone;

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectCustomer(c)}
                    className={`w-full px-3 py-2 rounded-lg text-left flex items-center justify-between transition-all cursor-pointer group mb-1 ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900/90 hover:bg-indigo-50 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                        isSelected 
                          ? 'bg-white/20 text-white' 
                          : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
                      }`}>
                        {c.name ? c.name.charAt(0).toUpperCase() : <User size={13} />}
                      </div>
                      
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-black truncate ${isSelected ? 'text-white' : 'text-slate-900 dark:text-slate-100 group-hover:text-indigo-600'}`}>
                            {c.name}
                          </span>
                          {(c.tags || []).map((t: string) => (
                            <span key={t} className={`text-[8px] font-bold px-1.5 py-0.2 rounded-md ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}>
                              {t}
                            </span>
                          ))}
                        </div>
                        <div className={`flex items-center gap-1 text-[10px] font-bold ${isSelected ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'}`}>
                          <Phone size={9} />
                          <span>{c.phone}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {c.visitCount !== undefined && c.visitCount > 0 && (
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                          isSelected 
                            ? 'bg-white/20 text-white' 
                            : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50'
                        }`}>
                          {c.visitCount} visits
                        </span>
                      )}

                      {c.balance !== undefined && c.balance > 0 && (
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                          isSelected ? 'bg-rose-500 text-white' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600'
                        }`}>
                          Due: ₹{c.balance}
                        </span>
                      )}

                      <div className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${
                        isSelected 
                          ? 'bg-white text-indigo-600' 
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white'
                      }`}>
                        {isSelected ? <Check size={12} className="stroke-[3]" /> : <ArrowRight size={12} />}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── COMPACT TOUCH VIRTUAL KEYBOARD ────────────────────────────────── */}
        {showKeyboard && (
          <div className="shrink-0 animate-in slide-in-from-bottom-2 duration-150 border-t border-slate-100 dark:border-slate-800 pt-1.5">
            <VirtualKeyboard 
              compact={true}
              value={activeInput === 'name' ? name : phone}
              onChange={val => {
                if (activeInput === 'name') setName(val);
                else setPhone(val);
              }}
              layout={activeInput === 'phone' ? 'numeric' : 'default'}
              onTab={() => setActiveInput(activeInput === 'name' ? 'phone' : 'name')}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button 
            type="button" 
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer"
          >
            Cancel
          </button>
          
          <button 
            type="button"
            onClick={handleSave} 
            className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-500/20 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Check size={14} />
            Save &amp; Continue
          </button>
        </div>

      </div>
    </div>
  );
}
