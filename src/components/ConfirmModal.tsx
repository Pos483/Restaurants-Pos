import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div 
        className="glass-modal rounded-2xl p-6 max-w-sm w-full animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center gap-3 text-red-500 dark:text-red-400 mb-4">
          <div className="bg-red-100 dark:bg-red-500/20 p-3 rounded-full shrink-0">
            <AlertTriangle size={24} />
          </div>
          <h3 className="font-black text-xl text-gray-800 dark:text-white">{title}</h3>
        </div>
        <p className="text-gray-600 dark:text-slate-400 font-medium mb-6">{message}</p>
        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-xl font-bold transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-200 dark:shadow-red-900/30 transition-all"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
