import { useState } from 'react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  layout?: 'default' | 'numeric';
  onTab?: () => void;
}

export default function VirtualKeyboard({ value, onChange, layout = 'default', onTab }: Props) {
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
    <div className="bg-gray-100 dark:bg-slate-800/80 p-2 sm:p-3 rounded-2xl w-full select-none shadow-inner dark:shadow-black/20">
      {rows.map((row, i) => (
        <div key={i} className={`flex justify-center gap-1 sm:gap-2 mb-1 sm:mb-2 ${layout === 'default' && i === 2 ? 'px-4 sm:px-8' : ''}`}>
          {row.map((key) => {
            let label = key;
            let flex = 'flex-1';
            let bg = 'bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 text-gray-800 dark:text-slate-100';
            
            if (key === '{bksp}') { 
              label = '⌫'; 
              flex = layout === 'numeric' ? 'flex-1' : 'w-12 sm:w-16 flex-none';
              bg = 'bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-red-600 dark:text-red-400';
            } else if (key === '{shift}') { 
              label = '⇧'; 
              flex = 'w-12 sm:w-16 flex-none';
              bg = shift ? 'bg-indigo-500 hover:bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200';
            } else if (key === '{space}') { 
              label = 'Space'; 
              flex = 'w-1/2 max-w-sm';
            } else if (key === '{tab}') {
              label = 'Tab ↹';
              flex = 'w-16 sm:w-24 flex-none';
              bg = 'bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200';
            }

            return (
              <button
                key={key}
                type="button"
                onClick={(e) => { e.preventDefault(); handleKeyClick(key); }}
                className={`${flex} ${bg} active:scale-95 active:bg-gray-300 dark:active:bg-slate-800 transition-all font-black py-3 sm:py-4 rounded-xl shadow border border-gray-200/50 dark:border-slate-600/30 text-lg sm:text-xl flex items-center justify-center`}
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
