import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { OrderItem, AppUser } from '../types';
import { supabase } from '../supabase';
import { localDb, cleanupRealtime, clearAllLocalTables } from '../db';
import { encryptText, decryptText } from '../utils/crypto';
import { logger } from '../utils/logger';

interface AppContextType {
  user: AppUser | null;
  setUser: (user: AppUser | null) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  cart: OrderItem[];
  setCart: React.Dispatch<React.SetStateAction<OrderItem[]>>;
  clearCart: () => void;
  logout: () => Promise<void>;
  loading: boolean;
  categoryLayout: 'top' | 'sidebar';
  setCategoryLayout: (layout: 'top' | 'sidebar') => void;
  isRecoveryMode: boolean;
  setIsRecoveryMode: (val: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ── Cart Dexie helpers with AES-GCM Encryption ─────────────────────────────

async function loadCartFromDexie(userId: string): Promise<OrderItem[]> {
  try {
    const row = await localDb.table('carts').get(userId);
    if (!row) return [];
    
    // Support seamless migration from legacy unencrypted items
    if (row.items && !row.encryptedData) {
      return row.items;
    }
    
    if (row.encryptedData) {
      const decrypted = await decryptText(row.encryptedData);
      return JSON.parse(decrypted);
    }
    return [];
  } catch {
    return [];
  }
}

async function saveCartToDexie(userId: string, items: OrderItem[]): Promise<void> {
  try {
    const encryptedData = await encryptText(JSON.stringify(items));
    await localDb.table('carts').put({ userId, encryptedData });
  } catch (e) {
    logger.error('[Cart] Failed to save cart to Dexie:', e);
  }
}

// ── AppProvider ───────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [categoryLayout, setCategoryLayoutState] = useState<'top' | 'sidebar'>(
    (localStorage.getItem('categoryLayout') as 'top' | 'sidebar') || 'sidebar'
  );

  // Track the userId for whom the cart was last saved to avoid stale saves
  const cartUserIdRef = useRef<string | null>(null);

  const setCategoryLayout = (layout: 'top' | 'sidebar') => {
    localStorage.setItem('categoryLayout', layout);
    setCategoryLayoutState(layout);
  };

  // ── Auth setup ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (session) {
          const emailConfirmed = session.user.email_confirmed_at != null;
          if (!emailConfirmed) {
            localStorage.setItem('pendingVerificationEmail', session.user.email || '');
            await supabase!.auth.signOut();
            setUser(null);
            setLoading(false);
            return;
          }
          localStorage.removeItem('pendingVerificationEmail');
          localStorage.setItem('activeUserId', session.user.id);
          localStorage.setItem('activeUserEmail', session.user.email || '');
          setUser(session.user);

          // Check if URL hash indicates a password recovery
          if (window.location.hash.includes('type=recovery')) {
            setIsRecoveryMode(true);
          }
        } else {
          localStorage.removeItem('activeUserId');
          localStorage.removeItem('activeUserEmail');
          setUser(null);
        }
        setLoading(false);
      }).catch(err => {
        logger.error('Error fetching Supabase session:', err);
        setLoading(false);
      });

      const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
        logger.log(`Auth event: ${event}`);
        if (event === 'PASSWORD_RECOVERY') {
          setIsRecoveryMode(true);
        }
        
        if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
          const emailConfirmed = session.user.email_confirmed_at != null;
          if (!emailConfirmed) {
            localStorage.setItem('pendingVerificationEmail', session.user.email || '');
            setUser(null);
            if (supabase) supabase.auth.signOut();
            return;
          }
          localStorage.removeItem('pendingVerificationEmail');
          localStorage.setItem('activeUserId', session.user.id);
          localStorage.setItem('activeUserEmail', session.user.email || '');
          setUser(session.user);

          // Backup check in case the event PASSWORD_RECOVERY is bundled or missed
          if (window.location.hash.includes('type=recovery')) {
            setIsRecoveryMode(true);
          }
        } else if (event === 'SIGNED_OUT') {
          localStorage.removeItem('activeUserId');
          localStorage.removeItem('activeUserEmail');
          setUser(null);
          setIsRecoveryMode(false);
          await cleanupRealtime();
        }
      });

      return () => {
        authListener?.subscription?.unsubscribe();
      };
    } else {
      setLoading(false);
    }
  }, []);

  // ── Cart — Load from Dexie when user changes ──────────────────────────────

  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      setCart([]);
      cartUserIdRef.current = null;
      return;
    }
    cartUserIdRef.current = userId;
    loadCartFromDexie(userId).then(items => {
      // Only apply if the user hasn't changed again while we were loading
      if (cartUserIdRef.current === userId) {
        setCart(items);
      }
    });
  }, [user]);

  // ── Cart — Save to Dexie whenever cart changes ────────────────────────────

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    saveCartToDexie(userId, cart);
  }, [cart, user]);

  // ── clearCart ─────────────────────────────────────────────────────────────

  const clearCart = () => setCart([]);

  // ── logout ────────────────────────────────────────────────────────────────

  const logout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    await cleanupRealtime();
    localStorage.removeItem('activeUserId');
    localStorage.removeItem('activeUserEmail');
    
    // Clear all local database tables on logout to prevent cache leaks
    await clearAllLocalTables();

    setUser(null);
    setActiveTab('dashboard');
    setCart([]);
  };

  return (
    <AppContext.Provider value={{ 
      user, setUser, 
      activeTab, setActiveTab, 
      cart, setCart, clearCart,
      logout,
      loading,
      categoryLayout,
      setCategoryLayout,
      isRecoveryMode,
      setIsRecoveryMode
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
