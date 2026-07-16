import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../supabase';
import { DBMenuItem, DBCategory } from '../db/types';
import { Plus, Minus, Search, ShoppingBag, Utensils, CheckCircle, ChevronRight, Phone, User, Globe, XCircle, MapPin, Clock } from 'lucide-react';

interface Props {
  restaurantCode: string;
  tableId: string;
  isOnline: boolean;
}

interface CartItem {
  menuItem: DBMenuItem;
  quantity: number;
}

export default function PublicOrdering({ restaurantCode, tableId, isOnline }: Props) {
  const [pin, setPin] = useState('');
  const [verifiedPin, setVerifiedPin] = useState('');
  const [isVerified, setIsVerified] = useState(!tableId);
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const [restaurantUpiId, setRestaurantUpiId] = useState('');
  const [orderType, setOrderType] = useState<'delivery' | 'takeaway'>('delivery');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [pickupTime, setPickupTime] = useState('');

  const [onlineDeliveryEnabled, setOnlineDeliveryEnabled] = useState(true);
  const [onlineTakeawayEnabled, setOnlineTakeawayEnabled] = useState(true);

  const [activeOrderId, setActiveOrderId] = useState<string | null>(() => localStorage.getItem('lastOnlineOrderId'));
  const [trackedOrder, setTrackedOrder] = useState<any>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<'menu' | 'search' | 'cart' | 'track'>('menu');

  const [restaurantName, setRestaurantName] = useState('Siya Bill');
  const [tenantId, setTenantId] = useState('');
  const [menuItems, setMenuItems] = useState<DBMenuItem[]>([]);
  const [categories, setCategories] = useState<DBCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingMenu, setLoadingMenu] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // Force light mode for customer portal
  useEffect(() => {
    const root = window.document.documentElement;
    const hadDark = root.classList.contains('dark');
    if (hadDark) {
      root.classList.remove('dark');
      root.classList.add('light');
    }
    return () => {
      if (hadDark) {
        root.classList.remove('light');
        root.classList.add('dark');
      }
    };
  }, []);

  // Auto-switch to menu tab if basket becomes empty while viewing cart
  useEffect(() => {
    if (cart.length === 0 && activeMobileTab === 'cart') {
      setActiveMobileTab('menu');
    }
  }, [cart, activeMobileTab]);

  // Realtime order status tracking
  useEffect(() => {
    if (!activeOrderId || !supabase) return;
    const client = supabase;

    const fetchOrder = async () => {
      const { data, error } = await client
        .from('online_orders')
        .select('*')
        .eq('id', activeOrderId)
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch tracked order:', error);
      } else if (data) {
        setTrackedOrder(data);
      } else {
        setActiveOrderId(null);
        localStorage.removeItem('lastOnlineOrderId');
      }
    };
    fetchOrder();

    const channel = client
      .channel(`track_${activeOrderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'online_orders', filter: `id=eq.${activeOrderId}` },
        (payload) => {
          if (payload.new) {
            setTrackedOrder(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [activeOrderId]);

  // Load menu automatically if verified
  useEffect(() => {
    if (isVerified) {
      loadMenuAndCategories();
    }
  }, [isVerified]);

  // 1. PIN verification
  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 3) {
      setPinError('PIN must be 3 digits.');
      return;
    }
    setVerifying(true);
    setPinError('');

    if (!supabase) {
      setPinError('Database connection unavailable.');
      setVerifying(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('verify_table_pin', {
        p_restaurant_code: restaurantCode,
        p_table_id: tableId,
        p_pin: pin
      });

      if (error) throw error;

      if (data === true) {
        setIsVerified(true);
        setVerifiedPin(pin);
        loadMenuAndCategories();
      } else {
        setPinError('Invalid PIN! Please ask the waiter for the correct code.');
      }
    } catch (err: any) {
      console.error('PIN Verification Error:', err);
      setPinError('Failed to verify PIN. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  // 2. Fetch Menu & Categories
  const loadMenuAndCategories = async () => {
    if (!supabase) return;
    setLoadingMenu(true);
    try {
      const { data: profile, error: profileErr } = await supabase
        .from('restaurant_profile')
        .select('app_user_id, restaurant_name, upi_id, upi_enabled')
        .eq('restaurant_code', restaurantCode)
        .single();

      if (profileErr || !profile) throw profileErr || new Error('Restaurant profile not found');
      
      setRestaurantName(profile.restaurant_name || 'Restaurant');
      setTenantId(profile.app_user_id);
      setRestaurantUpiId(profile.upi_id || '');

      const [settingsRes, menuRes, catRes] = await Promise.all([
        supabase
          .from('restaurant_settings')
          .select('online_delivery_enabled, online_takeaway_enabled')
          .eq('app_user_id', profile.app_user_id)
          .maybeSingle(),
        supabase
          .from('menu_items')
          .select('*')
          .eq('app_user_id', profile.app_user_id)
          .eq('is_active', true),
        supabase
          .from('categories')
          .select('*')
          .eq('app_user_id', profile.app_user_id)
      ]);

      if (settingsRes.error) throw settingsRes.error;
      if (menuRes.error) throw menuRes.error;
      if (catRes.error) throw catRes.error;

      if (settingsRes.data) {
        const isDeliveryOn = settingsRes.data.online_delivery_enabled !== false;
        const isTakeawayOn = settingsRes.data.online_takeaway_enabled !== false;
        setOnlineDeliveryEnabled(isDeliveryOn);
        setOnlineTakeawayEnabled(isTakeawayOn);

        if (!isDeliveryOn && isTakeawayOn) {
          setOrderType('takeaway');
        } else {
          setOrderType('delivery');
        }
      }

      const parsedMenu: DBMenuItem[] = (menuRes.data || []).map(r => ({
        id: r.id,
        name: r.name,
        price: Number(r.price),
        category: r.category,
        isActive: r.is_active,
        isFavorite: r.is_favorite,
        variants: r.variants || [],
        stockItemId: r.data?.stockItemId,
        stockQtyPerUnit: r.data?.stockQtyPerUnit,
        dietary: r.data?.dietary,
        printerTarget: r.printer_target
      }));

      const parsedCats: DBCategory[] = (catRes.data || [])
        .map(r => ({ id: r.id, name: r.name }))
        .filter(c => c.name && c.name.trim() !== ''); // Filter out empty category names

      setMenuItems(parsedMenu);
      setCategories(parsedCats);
    } catch (err) {
      console.error('Failed to load menu:', err);
    } finally {
      setLoadingMenu(false);
    }
  };

  // 3. Cart Actions
  const addToCart = (item: DBMenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.menuItem.id === item.id);
      if (existing) {
        return prev.map(i => i.menuItem.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  };

  const updateQuantity = (itemId: string, amount: number) => {
    setCart(prev => {
      const existing = prev.find(i => i.menuItem.id === itemId);
      if (!existing) return prev;
      const newQty = existing.quantity + amount;
      if (newQty <= 0) {
        return prev.filter(i => i.menuItem.id !== itemId);
      }
      return prev.map(i => i.menuItem.id === itemId ? { ...i, quantity: newQty } : i);
    });
  };

  const totalCartItems = cart.reduce((sum, i) => sum + i.quantity, 0);
  const cartSubtotal = cart.reduce((sum, i) => sum + (i.menuItem.price * i.quantity), 0);

  // 4. Place Order
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    if (!customerName.trim() || !customerPhone.trim()) {
      alert('Please enter your name and phone number.');
      return;
    }
    setPlacingOrder(true);

    if (!supabase) {
      alert('Database connection unavailable.');
      setPlacingOrder(false);
      return;
    }

    if (tableId) {
      // Verify PIN again before placing the order to prevent ordering after session ends (bill settlement)
      try {
        const { data: isPinStillValid, error: pinCheckError } = await supabase.rpc('verify_table_pin', {
          p_restaurant_code: restaurantCode,
          p_table_id: tableId,
          p_pin: verifiedPin
        });

        if (pinCheckError) throw pinCheckError;

        if (isPinStillValid !== true) {
          alert('This dining session has ended. Please scan the QR code again or ask the waiter for the new table PIN.');
          setIsVerified(false);
          setVerifiedPin('');
          setPin('');
          setCart([]);
          setPlacingOrder(false);
          return;
        }
      } catch (err) {
        console.error('Pre-order PIN verification failed:', err);
        alert('Security verification failed. Please try again.');
        setPlacingOrder(false);
        return;
      }
    }

    try {
      if (tableId) {
        const { error } = await supabase.from('self_orders').insert({
          app_user_id: tenantId,
          table_id: tableId,
          customer_name: customerName,
          customer_phone: customerPhone,
          items: cart.map(item => ({
            menuItem: {
              id: item.menuItem.id,
              name: item.menuItem.name,
              price: item.menuItem.price,
              category: item.menuItem.category,
              printerTarget: item.menuItem.printerTarget || 'kitchen'
            },
            quantity: item.quantity
          })),
          status: 'pending',
          timestamp: Date.now()
        });

        if (error) throw error;
      } else {
        // Enforce validations for online order types
        if (orderType === 'delivery' && !deliveryAddress.trim()) {
          alert('Please enter a delivery address.');
          setPlacingOrder(false);
          return;
        }
        if (orderType === 'takeaway' && !pickupTime.trim()) {
          alert('Please enter your pickup time.');
          setPlacingOrder(false);
          return;
        }

        const { data, error } = await supabase.from('online_orders').insert({
          app_user_id: tenantId,
          customer_name: customerName,
          customer_phone: customerPhone,
          order_type: orderType,
          delivery_address: orderType === 'delivery' ? deliveryAddress.trim() : null,
          pickup_time: orderType === 'takeaway' ? pickupTime.trim() : null,
          payment_method: 'UPI',
          payment_status: 'pending', // cashier verifies soundbox receipt before approving
          items: cart.map(item => ({
            menuItem: {
              id: item.menuItem.id,
              name: item.menuItem.name,
              price: item.menuItem.price,
              category: item.menuItem.category,
              printerTarget: item.menuItem.printerTarget || 'kitchen'
            },
            quantity: item.quantity
          })),
          status: 'pending',
          timestamp: Date.now()
        }).select('id').single();

        if (error) throw error;

        if (data?.id) {
          localStorage.setItem('lastOnlineOrderId', data.id);
          setActiveOrderId(data.id);
          setActiveMobileTab('track');
        }
      }

      setOrderSuccess(true);
      setCart([]);
    } catch (err: any) {
      console.error('Order Placement Error:', err);
      alert('Failed to place order. Please try again.');
    } finally {
      setPlacingOrder(false);
    }
  };

  const filteredMenuItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (!isOnline) {
    return (
      <div className="h-[100dvh] w-screen flex flex-col items-center justify-center bg-[#FAFBFC] p-6 text-center select-none">
        <div className="bg-white border border-gray-150 p-8 rounded-3xl max-w-sm shadow-xl flex flex-col items-center gap-6">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center animate-pulse border border-red-100">
            <Utensils size={32} />
          </div>
          <div>
            <h1 className="text-lg font-black text-gray-800">Connection Offline</h1>
            <p className="text-[11px] text-gray-400 font-bold mt-2 leading-relaxed">
              Dine-in self ordering requires a live internet connection to communicate with the restaurant. Please check your data or Wi-Fi.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Success Screen
  if (orderSuccess) {
    return (
      <div className="h-[100dvh] w-screen bg-[#F3F4F6] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white border border-gray-100 rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center gap-6 animate-fade-in">
          <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center shadow-inner animate-[pulse_2s_infinite] border border-green-150">
            <CheckCircle size={42} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-855 tracking-tight">Order Placed!</h1>
            <p className="text-xs text-gray-500 font-bold mt-2.5 leading-relaxed max-w-xs mx-auto">
              Your order has been submitted. Cooking will begin once the cashier confirms. Enjoy your meal!
            </p>
          </div>
          <button
            onClick={() => setOrderSuccess(false)}
            className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white font-extrabold rounded-2xl text-xs shadow-lg shadow-orange-500/20 active:scale-95 transition-all cursor-pointer"
          >
            Order More Items
          </button>
        </div>
      </div>
    );
  }

  if (!tableId && !onlineDeliveryEnabled && !onlineTakeawayEnabled) {
    return (
      <div className="h-[100dvh] w-screen bg-[#0F172A] flex flex-col items-center justify-center p-6 text-center select-none relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-72 h-72 rounded-full bg-orange-500/5 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 rounded-full bg-rose-500/5 blur-3xl" />
        <div className="max-w-sm flex flex-col items-center gap-6 relative z-10 animate-fade-in">
          <div className="w-20 h-20 bg-orange-500/10 text-orange-500 rounded-3xl flex items-center justify-center border border-orange-500/20 shadow-lg shadow-orange-500/10">
            <Globe size={38} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white leading-tight">Online Ordering is Closed</h1>
            <p className="text-xs text-slate-400 font-bold mt-3 leading-relaxed">
              We are currently not accepting delivery or takeaway orders online. Please call or visit us directly to place your order!
            </p>
          </div>
        </div>
      </div>
    );
  }

  // PIN Verification Page (Stunning glassmorphic redesign)
  if (!isVerified) {
    return (
      <div className="h-[100dvh] w-screen bg-gradient-to-tr from-slate-900 via-slate-880 to-indigo-950 flex flex-col items-center justify-center p-6 overflow-hidden relative">
        {/* Soft background light spots */}
        <div className="absolute top-[-10%] left-[-10%] w-72 h-72 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 rounded-full bg-rose-500/10 blur-3xl" />

        <form onSubmit={handleVerifyPin} className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col gap-6 animate-fade-in relative z-10">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-gradient-to-tr from-orange-500 to-rose-500 text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-orange-500/20">
              <Utensils size={32} className="animate-[pulse_3s_infinite]" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight leading-tight">Dine-in Ordering</h1>
            <p className="text-[10px] text-orange-400 font-extrabold uppercase tracking-widest mt-1">Table {tableId}</p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase text-slate-355 tracking-wider text-center">Enter Table PIN</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={3}
              placeholder="0 0 0"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl font-black text-center text-2xl text-white focus:outline-none focus:border-orange-500 tracking-[0.75em] focus:bg-white/15 transition-all shadow-inner placeholder:text-slate-655"
            />
            {pinError && (
              <p className="text-[10px] text-red-400 font-bold mt-1 text-center animate-shake">{pinError}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={verifying || pin.length !== 3}
            className="w-full py-4 bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 disabled:from-slate-800 disabled:to-slate-900 disabled:text-slate-600 text-white font-extrabold rounded-2xl text-xs shadow-lg shadow-orange-500/10 hover:shadow-orange-500/20 transition-all duration-200 cursor-pointer active:scale-95 flex justify-center items-center gap-2 border border-white/5"
          >
            {verifying ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : 'Access Digital Menu'}
          </button>
        </form>
      </div>
    );
  }

  // Premium Restaurant Menu View
  return (
    <div className="h-[100dvh] flex flex-col bg-[#F9FAFB] font-sans text-gray-800 select-none overflow-hidden relative">
      
      {/* Dynamic Gradient Header */}
      <header className="bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950 px-5 py-4 flex justify-between items-center shrink-0 shadow-md relative">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-rose-500/10 pointer-events-none" />
        <div className="relative z-10 min-w-0 flex-1 pr-2">
          <h1 className="text-[15px] font-black text-white leading-snug truncate">{restaurantName}</h1>
          <p className="text-[9px] text-orange-400 font-black uppercase mt-0.5 tracking-widest">
            {tableId ? `Table ${tableId}` : 'Online Ordering'}
          </p>
        </div>
        <div className="relative z-10 shrink-0 flex items-center gap-1.5 text-[9px] font-black uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Session
        </div>
      </header>

      {/* Main View Area */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        
        {/* TAB 1: MENU VIEW */}
        {activeMobileTab === 'menu' && (
          <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
            {/* Horizontal Category Chips */}
            <div className="bg-white border-b border-gray-150 p-4 shrink-0 flex gap-2 overflow-x-auto scrollbar-hide shadow-xs">
              <button
                type="button"
                onClick={() => setSelectedCategory('All')}
                className={`px-4 py-2 rounded-full text-[10px] font-black tracking-wider uppercase whitespace-nowrap transition-all border cursor-pointer ${
                  selectedCategory === 'All'
                    ? 'bg-gradient-to-r from-orange-500 to-rose-500 text-white border-orange-500 shadow-md shadow-orange-500/15'
                    : 'bg-slate-50 text-gray-500 border-gray-150 hover:bg-slate-100'
                }`}
              >
                All Items
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`px-4 py-2 rounded-full text-[10px] font-black tracking-wider uppercase whitespace-nowrap transition-all border cursor-pointer ${
                    selectedCategory === cat.name
                      ? 'bg-gradient-to-r from-orange-500 to-rose-500 text-white border-orange-500 shadow-md shadow-orange-500/15'
                      : 'bg-slate-50 text-gray-500 border-gray-150 hover:bg-slate-100'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Grid of Dishes */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 scrollbar-hide pb-20">
              {loadingMenu ? (
                <div className="h-full flex items-center justify-center">
                  <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filteredMenuItems.length === 0 ? (
                <div className="text-center py-16 text-xs font-bold text-gray-400">
                  No dishes found matching your selection.
                </div>
              ) : (
                filteredMenuItems.map((item) => {
                  const cartQty = cart.find(i => i.menuItem.id === item.id)?.quantity || 0;
                  return (
                    <div key={item.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex justify-between items-center shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 group">
                      <div className="flex flex-col gap-1.5 min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          {item.dietary && (
                            <span className={`w-3.5 h-3.5 border flex items-center justify-center shrink-0 p-0.5 rounded ${
                              item.dietary === 'veg' ? 'border-green-600 text-green-600' : 'border-red-600 text-red-600'
                            }`} style={{ borderWidth: '1.5px' }}>
                              <span className={`w-1.5 h-1.5 rounded-full ${item.dietary === 'veg' ? 'bg-green-600' : 'bg-red-600'}`} />
                            </span>
                          )}
                          <span className="font-extrabold text-[13px] text-gray-855 truncate group-hover:text-orange-600 transition-colors duration-200 leading-snug">{item.name}</span>
                        </div>
                        <span className="text-[13px] font-black text-gray-900">₹{item.price.toFixed(2)}</span>
                      </div>

                      <div className="shrink-0">
                        {cartQty > 0 ? (
                          <div className="flex items-center gap-3 bg-orange-50 border border-orange-100 rounded-2xl px-3 py-1.5 text-xs shadow-sm">
                            <button type="button" onClick={() => updateQuantity(item.id, -1)} className="text-orange-600 hover:text-orange-700 active:scale-90 transition-transform cursor-pointer">
                              <Minus size={13} strokeWidth={3.5} />
                            </button>
                            <span className="font-black text-orange-700 w-4 text-center">{cartQty}</span>
                            <button type="button" onClick={() => addToCart(item)} className="text-orange-600 hover:text-orange-700 active:scale-90 transition-transform cursor-pointer">
                              <Plus size={13} strokeWidth={3.5} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addToCart(item)}
                            className="px-5 py-2 bg-orange-50 border border-orange-100/50 text-orange-600 hover:bg-orange-600 hover:text-white font-extrabold text-[11px] rounded-2xl active:scale-95 cursor-pointer shadow-sm hover:shadow transition-all duration-200"
                          >
                            ADD
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SEARCH VIEW */}
        {activeMobileTab === 'search' && (
          <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4 animate-fade-in">
            <div className="relative shrink-0">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search delicious dishes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 !bg-white !text-gray-800 !border-gray-200 rounded-2xl text-xs focus:outline-none focus:border-orange-500 font-bold transition-all shadow-inner placeholder:text-gray-400"
              />
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-3.5 scrollbar-hide pb-20">
              {filteredMenuItems.length === 0 ? (
                <div className="text-center py-16 text-xs font-bold text-gray-400">
                  No dishes found matching your search.
                </div>
              ) : (
                filteredMenuItems.map((item) => {
                  const cartQty = cart.find(i => i.menuItem.id === item.id)?.quantity || 0;
                  return (
                    <div key={item.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex justify-between items-center shadow-sm">
                      <div className="flex flex-col gap-1.5 min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          {item.dietary && (
                            <span className={`w-3.5 h-3.5 border flex items-center justify-center shrink-0 p-0.5 rounded ${
                              item.dietary === 'veg' ? 'border-green-600 text-green-600' : 'border-red-600 text-red-600'
                            }`} style={{ borderWidth: '1.5px' }}>
                              <span className={`w-1.5 h-1.5 rounded-full ${item.dietary === 'veg' ? 'bg-green-600' : 'bg-red-600'}`} />
                            </span>
                          )}
                          <span className="font-extrabold text-[13px] text-gray-850 truncate">{item.name}</span>
                        </div>
                        <span className="text-[13px] font-black text-gray-900">₹{item.price.toFixed(2)}</span>
                      </div>

                      <div className="shrink-0">
                        {cartQty > 0 ? (
                          <div className="flex items-center gap-3 bg-orange-50 border border-orange-100 rounded-2xl px-3 py-1.5 text-xs shadow-sm">
                            <button type="button" onClick={() => updateQuantity(item.id, -1)} className="text-orange-600 hover:text-orange-700 active:scale-90 transition-transform cursor-pointer">
                              <Minus size={13} strokeWidth={3.5} />
                            </button>
                            <span className="font-black text-orange-700 w-4 text-center">{cartQty}</span>
                            <button type="button" onClick={() => addToCart(item)} className="text-orange-600 hover:text-orange-700 active:scale-90 transition-transform cursor-pointer">
                              <Plus size={13} strokeWidth={3.5} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addToCart(item)}
                            className="px-5 py-2 bg-orange-50 border border-orange-100/50 text-orange-600 hover:bg-orange-600 hover:text-white font-extrabold text-[11px] rounded-2xl active:scale-95 cursor-pointer"
                          >
                            ADD
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 3: CART & CHECKOUT VIEW */}
        {activeMobileTab === 'cart' && (
          <div className="flex-1 flex flex-col overflow-hidden animate-fade-in bg-slate-50/50">
            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-white">
                <div className="w-16 h-16 bg-slate-100 text-gray-400 rounded-2xl flex items-center justify-center border border-gray-150 shadow-inner mb-4">
                  <ShoppingBag size={28} />
                </div>
                <h3 className="font-black text-gray-800 text-sm">Your basket is empty</h3>
                <p className="text-[11px] text-gray-400 font-bold mt-1.5 max-w-[220px] leading-relaxed">
                  Add delicious food items from our menu to place your online order.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveMobileTab('menu')}
                  className="mt-5 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-black text-[10px] uppercase tracking-wider rounded-xl shadow-md shadow-orange-500/10 active:scale-95 cursor-pointer"
                >
                  Browse Menu
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Cart Items List */}
                <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4.5 scrollbar-hide">
                  {cart.map((item) => (
                    <div key={item.menuItem.id} className="flex justify-between items-center bg-white border border-gray-100 p-3.5 rounded-2xl shadow-sm">
                      <div className="min-w-0 pr-4">
                        <p className="font-extrabold text-[12px] text-gray-855 truncate leading-snug">{item.menuItem.name}</p>
                        <p className="text-[10px] text-orange-600 font-black mt-0.5">₹{item.menuItem.price.toFixed(2)} each</p>
                      </div>
                      <div className="flex items-center gap-3 bg-slate-50 border border-gray-150 rounded-2xl px-3 py-1.5 text-xs shrink-0 shadow-inner">
                        <button type="button" onClick={() => updateQuantity(item.menuItem.id, -1)} className="text-gray-500 hover:text-gray-700 active:scale-90 transition-transform cursor-pointer">
                          <Minus size={13} strokeWidth={3.5} />
                        </button>
                        <span className="font-black text-gray-700 w-4 text-center">{item.quantity}</span>
                        <button type="button" onClick={() => updateQuantity(item.menuItem.id, 1)} className="text-gray-500 hover:text-gray-700 active:scale-90 transition-transform cursor-pointer">
                          <Plus size={13} strokeWidth={3.5} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Checkout Form Container */}
                <form onSubmit={handlePlaceOrder} className="px-5 pt-4 pb-20 border-t border-gray-150 bg-white flex flex-col gap-4 shrink-0 overflow-y-auto max-h-[50vh] scrollbar-hide shadow-lg">
                  <div className="flex flex-col gap-3">
                    
                    {/* Toggle between Delivery and Takeaway */}
                    {!tableId && onlineDeliveryEnabled && onlineTakeawayEnabled && (
                      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setOrderType('delivery')}
                          className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            orderType === 'delivery' ? 'bg-white text-gray-800 shadow-xs' : 'text-gray-400 hover:text-gray-600'
                          }`}
                        >
                          Home Delivery
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrderType('takeaway')}
                          className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            orderType === 'takeaway' ? 'bg-white text-gray-800 shadow-xs' : 'text-gray-400 hover:text-gray-600'
                          }`}
                        >
                          Self Takeaway
                        </button>
                      </div>
                    )}

                    <div className="relative">
                      <User size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        required
                        placeholder="Enter Your Name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 !bg-white !text-gray-800 !border-gray-200 rounded-2xl text-xs focus:outline-none focus:border-orange-500 font-bold focus:ring-1 focus:ring-orange-500/20 placeholder:text-gray-400"
                      />
                    </div>

                    <div className="relative">
                      <Phone size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={10}
                        required
                        placeholder="10-Digit Mobile Number"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                        className="w-full pl-9 pr-4 py-2.5 !bg-white !text-gray-800 !border-gray-200 rounded-2xl text-xs focus:outline-none focus:border-orange-500 font-bold focus:ring-1 focus:ring-orange-500/20 placeholder:text-gray-400"
                      />
                    </div>

                    {!tableId && orderType === 'delivery' && (
                      <div className="relative">
                        <MapPin size={13} className="absolute left-3.5 top-3 text-gray-400" />
                        <textarea
                          required
                          rows={2}
                          placeholder="Complete Delivery Address (with landmarks)"
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          className="w-full pl-9 pr-4 py-2.5 !bg-white !text-gray-800 !border-gray-200 rounded-2xl text-xs focus:outline-none focus:border-orange-500 font-bold focus:ring-1 focus:ring-orange-500/20 resize-none placeholder:text-gray-400"
                        />
                      </div>
                    )}

                    {!tableId && orderType === 'takeaway' && (
                      <div className="relative">
                        <Clock size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          required
                          placeholder="Takeaway Time (e.g. 20 Mins, 8:30 PM)"
                          value={pickupTime}
                          onChange={(e) => setPickupTime(e.target.value)}
                          className="w-full pl-9 pr-4 py-2.5 !bg-white !text-gray-800 !border-gray-200 rounded-2xl text-xs focus:outline-none focus:border-orange-500 font-bold focus:ring-1 focus:ring-orange-500/20 placeholder:text-gray-400"
                        />
                      </div>
                    )}

                    {/* Direct UPI Payment QR & Intent Link */}
                    {!tableId && (
                      <div className="bg-orange-50/45 border border-orange-100/50 rounded-2xl p-4 flex flex-col gap-3 my-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-orange-850 uppercase tracking-wider">Pay Online via UPI</span>
                          <span className="text-[8px] text-emerald-600 bg-emerald-100/40 px-2 py-0.5 rounded-full font-black uppercase">Zero Extra Charges</span>
                        </div>

                        <div className="flex flex-col gap-2.5 items-center justify-center">
                          <a
                            href={`upi://pay?pa=${restaurantUpiId || '8677994666@upi'}&pn=${encodeURIComponent(restaurantName)}&am=${cartSubtotal}&cu=INR`}
                            className="w-full py-3 bg-gradient-to-r from-indigo-650 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-center rounded-2xl text-[10px] font-extrabold uppercase tracking-wider shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5 border border-indigo-500/10 cursor-pointer"
                          >
                            ⚡ Open GPay / PhonePe / Paytm
                          </a>

                          <div className="hidden sm:block p-2 bg-white rounded-xl border border-gray-150 shadow-inner mt-1">
                            <QRCodeSVG
                              value={`upi://pay?pa=${restaurantUpiId || '8677994666@upi'}&pn=${encodeURIComponent(restaurantName)}&am=${cartSubtotal}&cu=INR`}
                              size={100}
                              level="H"
                            />
                          </div>

                          <p className="text-[8.5px] text-slate-400 font-bold text-center leading-relaxed max-w-[240px]">
                            Pay using the UPI button above. Once done, click the "Place Prepaid Order" button below to complete.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center text-xs font-black text-gray-800 border-t border-gray-200/50 pt-3">
                    <span className="text-gray-400 uppercase font-black text-[10px] tracking-wider">Total Amount</span>
                    <span className="text-sm font-black text-gray-900">₹{cartSubtotal.toFixed(2)}</span>
                  </div>

                  <button
                    type="submit"
                    disabled={placingOrder}
                    className="w-full py-4 bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white font-black rounded-2xl text-xs shadow-lg shadow-orange-500/20 transition-all duration-200 cursor-pointer flex justify-center items-center gap-1.5 active:scale-95 border border-white/5"
                  >
                    {placingOrder ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      tableId ? 'Place Order & Send to Kitchen' : 'Place Prepaid Order'
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: TRACK ORDER VIEW */}
        {activeMobileTab === 'track' && (
          <div className="flex-1 flex flex-col overflow-hidden p-5 animate-fade-in bg-slate-50/20">
            {!activeOrderId || !trackedOrder ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-white rounded-2xl border border-gray-150 animate-fade-in">
                <div className="w-16 h-16 bg-slate-100 text-gray-400 rounded-2xl flex items-center justify-center border border-gray-150 shadow-inner mb-4">
                  <Globe size={28} />
                </div>
                <h3 className="font-black text-gray-805 text-sm">No active orders</h3>
                <p className="text-[11px] text-gray-400 font-bold mt-1.5 max-w-[220px] leading-relaxed">
                  Once you place a delivery or takeaway order, you can track its live preparation progress here.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveMobileTab('menu')}
                  className="mt-5 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-black text-[10px] uppercase tracking-wider rounded-xl shadow-md shadow-orange-500/10 active:scale-95 cursor-pointer"
                >
                  Go to Menu
                </button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto flex flex-col gap-6 scrollbar-hide text-gray-850 pb-20">
                {/* Visual Tracker Status Progress Steps */}
                <div className="flex flex-col gap-4 bg-white border border-gray-100 p-4.5 rounded-2xl shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-sm ${
                      ['pending', 'accepted', 'preparing', 'dispatched', 'delivered'].includes(trackedOrder.status)
                        ? 'bg-orange-500 text-white font-black' : 'bg-gray-200 text-gray-400 font-bold'
                    }`}>
                      1
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-gray-800">Order Placed</h4>
                      <p className="text-[9px] text-gray-400 font-bold">Waiting for cashier payment approval</p>
                    </div>
                  </div>

                  <div className="w-0.5 h-4 bg-gray-200 ml-4" />

                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-sm ${
                      ['accepted', 'preparing', 'dispatched', 'delivered'].includes(trackedOrder.status)
                        ? 'bg-orange-500 text-white font-black' : 'bg-gray-200 text-gray-400 font-bold'
                    }`}>
                      2
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-gray-800">Cooking & Preparing</h4>
                      <p className="text-[9px] text-gray-400 font-bold">The chef is preparing your meal</p>
                    </div>
                  </div>

                  <div className="w-0.5 h-4 bg-gray-200 ml-4" />

                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-sm ${
                      ['dispatched', 'delivered'].includes(trackedOrder.status)
                        ? 'bg-orange-500 text-white font-black' : 'bg-gray-200 text-gray-400 font-bold'
                    }`}>
                      3
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-gray-800">
                        {trackedOrder.orderType === 'delivery' ? 'Out for Delivery' : 'Ready for Takeaway'}
                      </h4>
                      <p className="text-[9px] text-gray-400 font-bold">
                        {trackedOrder.orderType === 'delivery'
                          ? 'Rider has picked up your order'
                          : 'Please visit the counter to pick up your order'}
                      </p>
                    </div>
                  </div>

                  <div className="w-0.5 h-4 bg-gray-200 ml-4" />

                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-sm ${
                      trackedOrder.status === 'delivered'
                        ? 'bg-emerald-500 text-white font-black' : 'bg-gray-200 text-gray-400 font-bold'
                    }`}>
                      ✓
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-gray-800">Completed</h4>
                      <p className="text-[9px] text-gray-400 font-bold">Order successfully delivered/picked up!</p>
                    </div>
                  </div>
                </div>

                {/* Order Status banner if rejected */}
                {trackedOrder.status === 'rejected' && (
                  <div className="bg-red-50 border border-red-200/50 text-red-650 p-4.5 rounded-2xl flex flex-col gap-1.5 shadow-sm">
                    <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                      <XCircle size={14} /> Order Rejected
                    </h4>
                    <p className="text-[10px] font-bold">
                      This order was rejected. Please contact the restaurant directly to clarify or adjust payment details.
                    </p>
                  </div>
                )}

                {/* Order Items List details */}
                <div className="flex flex-col gap-3">
                  <h4 className="text-[10px] font-black uppercase text-gray-455 tracking-wider">Order Summary</h4>
                  <div className="border border-gray-150 rounded-2xl p-4 flex flex-col gap-2.5 bg-white shadow-sm">
                    {trackedOrder.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-xs font-extrabold text-gray-700">
                        <span>{item.menuItem?.name || item.name} <span className="text-orange-550 font-black">x{item.quantity}</span></span>
                        <span>₹{((item.menuItem?.price || item.price || 0) * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="border-t border-gray-200/60 pt-2.5 flex justify-between items-center text-xs font-black text-gray-800">
                      <span>Total Amount</span>
                      <span>₹{trackedOrder.items.reduce((sum: number, item: any) => sum + ((item.menuItem?.price || item.price || 0) * item.quantity), 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Clear active order tracker if completed or rejected */}
                {['delivered', 'rejected'].includes(trackedOrder.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveOrderId(null);
                      setTrackedOrder(null);
                      localStorage.removeItem('lastOnlineOrderId');
                    }}
                    className="w-full py-4 bg-slate-900 hover:bg-slate-950 text-white font-black rounded-2xl text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    Clear Order & Return to Menu
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Active Order Tracker bar */}
      {activeOrderId && trackedOrder && activeMobileTab !== 'track' && (
        <div className="absolute bottom-20 left-4 right-4 bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950 text-white rounded-2xl p-4 flex justify-between items-center shadow-xl border border-white/5 animate-[pulse_3s_infinite] z-35">
          <div className="flex items-center gap-3 text-xs font-black">
            <div className="p-2 bg-orange-500/10 rounded-xl text-orange-400">
              <Globe size={18} className="animate-[spin_4s_linear_infinite]" />
            </div>
            <div>
              <p className="text-[11px] leading-tight font-black">Order Status: <span className="text-orange-400 capitalize">{trackedOrder.status}</span></p>
              <p className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Real-time status updates</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveMobileTab('track')}
            className="flex items-center gap-1 text-[9px] font-black uppercase bg-orange-600 hover:bg-orange-700 px-3.5 py-2.5 rounded-xl transition-all border border-white/5 shadow-md active:scale-95"
          >
            Track Live
          </button>
        </div>
      )}

      {/* Floating View Cart Trigger */}
      {totalCartItems > 0 && activeMobileTab !== 'cart' && (
        <div className="absolute bottom-20 left-4 right-4 bg-gradient-to-r from-orange-500 to-rose-600 text-white rounded-2xl p-4.5 flex justify-between items-center shadow-lg shadow-orange-500/30 animate-[pulse_2.5s_infinite] z-30">
          <div className="flex items-center gap-2 text-xs font-black">
            <ShoppingBag size={18} className="animate-bounce" />
            <span>{totalCartItems} Items | ₹{cartSubtotal.toFixed(2)}</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveMobileTab('cart')}
            className="flex items-center gap-1.5 text-[9px] font-black uppercase bg-white/15 hover:bg-white/25 px-4 py-2.5 rounded-xl transition-all cursor-pointer border border-white/10"
          >
            Review Cart
            <ChevronRight size={14} strokeWidth={3} />
          </button>
        </div>
      )}

      {/* Bottom Navigation Tab Bar (Premium Mobile Native UI) */}
      <div className="bg-white border-t border-gray-200 px-4 py-2 flex justify-around items-center shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.03)] z-40 relative">
        <button
          type="button"
          onClick={() => setActiveMobileTab('menu')}
          className={`flex flex-col items-center gap-1 py-1.5 px-3 transition-colors cursor-pointer ${
            activeMobileTab === 'menu' ? 'text-orange-600 font-black' : 'text-gray-400 font-bold'
          }`}
        >
          <Utensils size={18} />
          <span className="text-[8.5px] uppercase tracking-wider">Menu</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMobileTab('search')}
          className={`flex flex-col items-center gap-1 py-1.5 px-3 transition-colors cursor-pointer ${
            activeMobileTab === 'search' ? 'text-orange-600 font-black' : 'text-gray-400 font-bold'
          }`}
        >
          <Search size={18} />
          <span className="text-[8.5px] uppercase tracking-wider">Search</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMobileTab('cart')}
          className={`flex flex-col items-center gap-1 py-1.5 px-3 transition-colors cursor-pointer relative ${
            activeMobileTab === 'cart' ? 'text-orange-600 font-black' : 'text-gray-400 font-bold'
          }`}
        >
          <div className="relative">
            <ShoppingBag size={18} />
            {totalCartItems > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-rose-500 text-white text-[8px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white">
                {totalCartItems}
              </span>
            )}
          </div>
          <span className="text-[8.5px] uppercase tracking-wider">Cart</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMobileTab('track')}
          className={`flex flex-col items-center gap-1 py-1.5 px-3 transition-colors cursor-pointer relative ${
            activeMobileTab === 'track' ? 'text-orange-600 font-black' : 'text-gray-400 font-bold'
          }`}
        >
          <div className="relative">
            <Globe size={18} className={activeOrderId && trackedOrder ? 'animate-[spin_8s_linear_infinite] text-orange-500' : ''} />
            {activeOrderId && trackedOrder && ['pending', 'accepted', 'preparing', 'dispatched'].includes(trackedOrder.status) && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 animate-ping" />
            )}
          </div>
          <span className="text-[8.5px] uppercase tracking-wider">Track</span>
        </button>
      </div>

    </div>
  );
}
