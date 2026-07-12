import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AppProvider } from './contexts/AppContext'
import { ToastProvider } from './components/Toast'
import { ThemeProvider } from './contexts/ThemeContext'

if (typeof window !== 'undefined' && window.location.search.includes('clear=true')) {
  window.indexedDB.deleteDatabase('RestaurantPOS_v3');
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.location.href = window.location.origin;
}

// Clean, standard event listeners to disable mouse wheel scroll and arrow key value modifications on active number inputs
if (typeof window !== 'undefined') {
  // Prevent mouse wheel modifications on active number inputs
  document.addEventListener('wheel', () => {
    if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'number') {
      document.activeElement.blur();
    }
  }, { passive: true });

  // Prevent arrow key up/down modifications on active number inputs
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
      }
    }
  });
}

// ── Global Auto-Capitalize (Title Case on every word) ───────────────────────
// Capitalizes first letter of every word as user types, in all text inputs
// and textareas, EXCEPT email, password, url, date, time, month, week, search fields.
if (typeof window !== 'undefined') {
  const SKIP_TYPES = new Set(['email', 'password', 'url', 'date', 'time', 'month', 'week', 'search', 'color', 'file', 'range']);
  const SKIP_ATTR = 'data-no-capitalize'; // add this attribute to opt out any specific input

  let _isCapitalizing = false;

  const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  const nativeTextareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

  const capitalizeWords = (str: string): string =>
    str.replace(/(^|[\s\u00A0])\S/g, (ch) => ch.toUpperCase());

  document.addEventListener('input', (e) => {
    if (_isCapitalizing) return;

    const el = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (!el) return;

    const isInput = el instanceof HTMLInputElement;
    const isTextarea = el instanceof HTMLTextAreaElement;
    if (!isInput && !isTextarea) return;

    // Skip excluded types
    if (isInput && SKIP_TYPES.has(el.type?.toLowerCase() || '')) return;

    // Skip opt-out fields
    if (el.hasAttribute(SKIP_ATTR)) return;

    // Skip readonly / disabled
    if (el.readOnly || el.disabled) return;

    const val = el.value;
    if (!val) return;

    const newVal = capitalizeWords(val);
    if (newVal === val) return;

    // Preserve cursor position
    const start = isInput ? (el as HTMLInputElement).selectionStart : null;
    const end   = isInput ? (el as HTMLInputElement).selectionEnd   : null;

    _isCapitalizing = true;
    try {
      if (isInput && nativeInputSetter) {
        nativeInputSetter.call(el, newVal);
      } else if (isTextarea && nativeTextareaSetter) {
        nativeTextareaSetter.call(el, newVal);
      } else {
        el.value = newVal;
      }
      // Notify React of the value change
      el.dispatchEvent(new Event('input', { bubbles: true }));
      // Restore cursor
      if (isInput && start !== null && end !== null) {
        (el as HTMLInputElement).setSelectionRange(start, end);
      }
    } finally {
      _isCapitalizing = false;
    }
  }, true); // capture phase so it runs before React handlers
}


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AppProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
