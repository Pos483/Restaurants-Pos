import { useState } from 'react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  layout?: 'default' | 'numeric';
  onTab?: () => void;
  compact?: boolean;
}

export default function VirtualKeyboard({ value, onChange, layout = 'default', onTab, compact = false }: Props) {
  const [shift, setShift] = useState(false);

  const handleKeyClick = (key: string) => {
    if (key === '{bksp}') {
      onChange(value.slice(0, -1));
    } else if (key === '{space}') {
      onChange(value + ' ');
    } else if (key === '{shift}') {
      setShift(!shift);
    } else if (key === '{tab}') {
      if (onTab) onTab();
    } else {
      onChange(value + (shift ? key.toUpperCase() : key.toLowerCase()));
      if (shift) setShift(false); // Auto-unshift after typing a character
    }
  };

  const textRows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['{shift}', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '{bksp}'],
    ['{tab}', '{space}']
  ];

  const numRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['{tab}', '0', '{bksp}']
  ];

  const rows = layout === 'numeric' ? numRows : textRows;

  return (
    <div className="bg-slate-100 dark:bg-slate-800/90 p-2 rounded-2xl w-full select-none shadow-inner border border-slate-200/80 dark:border-slate-700/60">
      {rows.map((row, i) => (
        <div key={i} className={`flex justify-center gap-1 sm:gap-1.5 mb-1 ${layout === 'default' && i === 2 ? 'px-3 sm:px-6' : ''}`}>
          {row.map((key) => {
            let label = key;
            let flex = 'flex-1';
            let bg = 'bg-white dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100';
            
            if (key === '{bksp}') { 
              label = '⌫'; 
              flex = layout === 'numeric' ? 'flex-1' : 'w-10 sm:w-14 flex-none';
              bg = 'bg-slate-200 dark:bg-slate-700 hover:bg-rose-100 text-rose-600 dark:text-rose-400';
            } else if (key === '{shift}') { 
              label = '⇧'; 
              flex = 'w-10 sm:w-14 flex-none';
              bg = shift ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200';
            } else if (key === '{space}') { 
              label = 'Space'; 
              flex = 'w-1/2 max-w-xs';
            } else if (key === '{tab}') {
              label = 'Tab ↹';
              flex = 'w-14 sm:w-20 flex-none';
              bg = 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200';
            }

            return (
              <button
                key={key}
                type="button"
                onClick={(e) => { e.preventDefault(); handleKeyClick(key); }}
                className={`${flex} ${bg} active:scale-95 transition-all font-black ${
                  compact ? 'py-1.5 sm:py-2 text-xs sm:text-sm' : 'py-2 sm:py-2.5 text-sm sm:text-base'
                } rounded-xl shadow-xs border border-slate-200/60 dark:border-slate-600/40 flex items-center justify-center cursor-pointer`}
              >
                {key.length === 1 && /[a-zA-Z]/.test(key) ? (shift ? label.toUpperCase() : label.toLowerCase()) : label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
