import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, X, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const timersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  React.useEffect(() => {
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
    timersRef.current.push(timer);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-20 sm:top-6 left-4 right-4 sm:left-auto sm:right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 p-4 rounded-2xl shadow-2xl border backdrop-blur-md animate-in slide-in-from-right-10 duration-300 transition-colors ${
              toast.type === 'success' ? 'bg-green-50/90 dark:bg-green-950/90 border-green-100 dark:border-green-900/40 text-green-700 dark:text-green-300' :
              toast.type === 'error' ? 'bg-red-50/90 dark:bg-red-950/90 border-red-100 dark:border-red-900/40 text-red-700 dark:text-red-300' :
              'bg-blue-50/90 dark:bg-blue-950/90 border-blue-100 dark:border-blue-900/40 text-blue-700 dark:text-blue-300'
            }`}
          >
            {toast.type === 'success' && <CheckCircle size={24} />}
            {toast.type === 'error' && <AlertCircle size={24} />}
            {toast.type === 'info' && <Info size={24} />}
            
            <p className="flex-1 font-bold text-sm break-words">{toast.message}</p>
            
            <button 
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
              title="Close"
              aria-label="Close notification"
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
