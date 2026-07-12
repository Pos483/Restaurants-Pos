import { useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import VirtualKeyboard from './VirtualKeyboard';
import { useToast } from './Toast';

interface Props {
  onSave: (name: string, price: number, quantity: number) => void;
  onClose: () => void;
}

export default function CustomItemModal({ onSave, onClose }: Props) {
  const { showToast } = useToast();
  const [name, setName] = useState('Custom Item');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');

  const nameInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  const [activeInput, setActiveInput] = useState<'name' | 'price' | 'quantity'>('price');

  useEffect(() => {
    if (priceInputRef.current) {
      priceInputRef.current.focus();
    }
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = () => {
    const p = parseFloat(price);
    const q = parseInt(quantity, 10);
    
    if (isNaN(p) || p < 0) {
      showToast('Please enter a valid price (0 or more)', 'error');
      return;
    }
    if (isNaN(q) || q <= 0) {
      showToast('Please enter a valid quantity', 'error');
      return;
    }
    if (q > 10000) {
      showToast(`${name || 'Custom Item'} quantity ${quantity} exceeds the allowed limit`, 'error');
      return;
    }

    onSave(name || 'Custom Item', p, q);
  };


  return (
    <div 
      className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="glass-modal rounded-3xl p-6 w-full max-w-sm max-h-[95vh] overflow-y-auto flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-black text-xl text-gray-800 dark:text-white flex items-center gap-2">
            <Plus size={24} className="text-orange-500" />
            Add Custom Item
          </h3>
          <button onClick={onClose} title="Close" aria-label="Close" className="p-2 text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase ml-1">Item Name</label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onClick={() => setActiveInput('name')}
              onChange={(e) => { setActiveInput('name'); setName(e.target.value); }}
              placeholder="Custom Item"
              className={`w-full mt-1 p-3 rounded-xl border-2 focus:outline-none font-bold transition-all ${activeInput === 'name' ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/20' : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'} dark:text-white`}
            />
          </div>
          
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase ml-1">Price (₹)</label>
              <input
                ref={priceInputRef}
                type="text"
                inputMode="numeric"
                value={price}
                onClick={() => setActiveInput('price')}
                onChange={(e) => { 
                  setActiveInput('price'); 
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  const parts = val.split('.');
                  setPrice(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : val); 
                }}
                placeholder="0"
                className={`w-full mt-1 p-3 rounded-xl border-2 focus:outline-none font-bold transition-all ${activeInput === 'price' ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/20' : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'} dark:text-white`}
              />
            </div>
            <div className="w-24">
              <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase ml-1">Qty</label>
              <input
                ref={qtyInputRef}
                type="text"
                inputMode="numeric"
                value={quantity}
                onClick={() => setActiveInput('quantity')}
                onChange={(e) => { setActiveInput('quantity'); setQuantity(e.target.value.replace(/[^0-9]/g, '')); }}
                placeholder="1"
                className={`w-full mt-1 p-3 rounded-xl border-2 focus:outline-none font-bold transition-all ${activeInput === 'quantity' ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/20' : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'} dark:text-white`}
              />
            </div>
          </div>
        </div>

        <div className="mt-2">
          <VirtualKeyboard 
            value={activeInput === 'name' ? name : activeInput === 'price' ? price : quantity}
            onChange={(val) => {
               if (activeInput === 'name') setName(val);
               if (activeInput === 'price') {
                 const cleaned = val.replace(/[^0-9.]/g, '');
                 const parts = cleaned.split('.');
                 setPrice(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned);
               }
               if (activeInput === 'quantity') setQuantity(val.replace(/[^0-9]/g, ''));
            }}
            layout={activeInput === 'name' ? 'default' : 'numeric'} 
          />
        </div>

        <div className="flex gap-3 mt-2">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-xl font-bold transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 dark:bg-orange-600 dark:hover:bg-orange-500 text-white rounded-xl font-bold shadow-lg shadow-orange-200 dark:shadow-orange-950/30 transition-colors">
            Add to Bill
          </button>
        </div>
      </div>
    </div>
  );
}
