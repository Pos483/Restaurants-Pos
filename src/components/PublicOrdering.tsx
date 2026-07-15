import { useState } from 'react';
import { supabase } from '../supabase';
import { DBMenuItem, DBCategory } from '../db/types';
import { Plus, Minus, Search, ShoppingBag, Utensils, CheckCircle, ChevronRight, X, Phone, User } from 'lucide-react';

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
  const [isVerified, setIsVerified] = useState(false);
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const [restaurantName, setRestaurantName] = useState('Siya Bill');
  const [tenantId, setTenantId] = useState('');
  const [menuItems, setMenuItems] = useState<DBMenuItem[]>([]);
  const [categories, setCategories] = useState<DBCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingMenu, setLoadingMenu] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

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
        .select('app_user_id, restaurant_name')
        .eq('restaurant_code', restaurantCode)
        .single();

      if (profileErr || !profile) throw profileErr || new Error('Restaurant profile not found');
      
      setRestaurantName(profile.restaurant_name || 'Restaurant');
      setTenantId(profile.app_user_id);

      const [menuRes, catRes] = await Promise.all([
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

      if (menuRes.error) throw menuRes.error;
      if (catRes.error) throw catRes.error;

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

    try {
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

      setOrderSuccess(true);
      setCart([]);
      setShowCart(false);
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
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#FAFBFC] p-6 text-center select-none">
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
      <div className="h-screen w-screen bg-[#F3F4F6] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white border border-gray-100 rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center gap-6 animate-fade-in">
          <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center shadow-inner animate-[pulse_2s_infinite] border border-green-150">
            <CheckCircle size={42} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-850 tracking-tight">Order Placed!</h1>
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

  // PIN Verification Page (Stunning glassmorphic redesign)
  if (!isVerified) {
    return (
      <div className="h-screen w-screen bg-gradient-to-tr from-slate-900 via-slate-800 to-indigo-950 flex flex-col items-center justify-center p-6 overflow-hidden relative">
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
            <label className="text-[10px] font-black uppercase text-slate-350 tracking-wider text-center">Enter Table PIN</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={3}
              placeholder="0 0 0"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl font-black text-center text-2xl text-white focus:outline-none focus:border-orange-500 tracking-[0.75em] focus:bg-white/15 transition-all shadow-inner placeholder:text-slate-600"
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
    <div className="h-screen flex flex-col bg-[#F9FAFB] font-sans text-gray-800 select-none overflow-hidden relative">
      
      {/* Dynamic Gradient Header */}
      <header className="bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950 px-5 py-5 flex justify-between items-center shrink-0 shadow-md relative">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-rose-500/10 pointer-events-none" />
        <div className="relative z-10 min-w-0 pr-4">
          <h1 className="text-base font-black text-white leading-tight truncate">{restaurantName}</h1>
          <p className="text-[9px] text-orange-400 font-black uppercase mt-0.5 tracking-widest">Table {tableId}</p>
        </div>
        <div className="relative z-10 flex items-center gap-1.5 text-[9px] font-black uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Session
        </div>
      </header>

      {/* Filter / Search Bar */}
      <div className="bg-white border-b border-gray-150 p-4 shrink-0 flex flex-col gap-3.5 shadow-sm relative z-20">
        <div className="relative">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search delicious dishes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-gray-150 rounded-2xl text-xs focus:outline-none focus:border-orange-500 font-bold focus:bg-white transition-all shadow-inner"
          />
        </div>
        
        {/* Horizontal Category Chips */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide shrink-0 pb-1 -mx-4 px-4">
          <button
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
      </div>

      {/* Grid of Dishes */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 scrollbar-hide pb-28">
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
                    <span className="font-extrabold text-[13px] text-gray-800 truncate group-hover:text-orange-600 transition-colors duration-200 leading-snug">{item.name}</span>
                  </div>
                  <span className="text-[13px] font-black text-gray-900">₹{item.price.toFixed(2)}</span>
                </div>

                <div className="shrink-0">
                  {cartQty > 0 ? (
                    <div className="flex items-center gap-3 bg-orange-50 border border-orange-100 rounded-2xl px-3 py-1.5 text-xs shadow-sm">
                      <button onClick={() => updateQuantity(item.id, -1)} className="text-orange-600 hover:text-orange-700 active:scale-90 transition-transform cursor-pointer">
                        <Minus size={13} strokeWidth={3.5} />
                      </button>
                      <span className="font-black text-orange-700 w-4 text-center">{cartQty}</span>
                      <button onClick={() => addToCart(item)} className="text-orange-600 hover:text-orange-700 active:scale-90 transition-transform cursor-pointer">
                        <Plus size={13} strokeWidth={3.5} />
                      </button>
                    </div>
                  ) : (
                    <button
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

      {/* Floating View Cart Trigger */}
      {totalCartItems > 0 && !showCart && (
        <div className="absolute bottom-5 left-4 right-4 bg-gradient-to-r from-orange-500 to-rose-600 text-white rounded-2xl p-4 flex justify-between items-center shadow-lg shadow-orange-500/30 animate-[pulse_2.5s_infinite] z-30">
          <div className="flex items-center gap-2 text-xs font-black">
            <ShoppingBag size={18} className="animate-bounce" />
            <span>{totalCartItems} Items | ₹{cartSubtotal.toFixed(2)}</span>
          </div>
          <button
            onClick={() => setShowCart(true)}
            className="flex items-center gap-1.5 text-[10px] font-black uppercase bg-white/15 hover:bg-white/25 px-4 py-2 rounded-xl transition-all cursor-pointer border border-white/10"
          >
            Review Cart
            <ChevronRight size={14} strokeWidth={3} />
          </button>
        </div>
      )}

      {/* Slide-Up Cart Drawer */}
      {showCart && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl max-h-[85%] flex flex-col shadow-2xl animate-slide-up overflow-hidden">
            
            {/* Drawer Header */}
            <div className="px-5 py-4.5 border-b border-gray-150 flex justify-between items-center shrink-0 bg-slate-50/50">
              <div>
                <h2 className="text-sm font-black text-gray-800">Your Basket</h2>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">{totalCartItems} Items Selected</p>
              </div>
              <button
                onClick={() => setShowCart(false)}
                className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full cursor-pointer transition-colors"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4.5 scrollbar-hide">
              {cart.map((item) => (
                <div key={item.menuItem.id} className="flex justify-between items-center">
                  <div className="min-w-0 pr-4">
                    <p className="font-extrabold text-[12px] text-gray-850 truncate leading-snug">{item.menuItem.name}</p>
                    <p className="text-[10px] text-orange-600 font-black mt-0.5">₹{item.menuItem.price.toFixed(2)} each</p>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-50 border border-gray-150 rounded-2xl px-3 py-1.5 text-xs shrink-0 shadow-inner">
                    <button onClick={() => updateQuantity(item.menuItem.id, -1)} className="text-gray-500 hover:text-gray-700 active:scale-90 transition-transform cursor-pointer">
                      <Minus size={13} strokeWidth={3.5} />
                    </button>
                    <span className="font-black text-gray-700 w-4 text-center">{item.quantity}</span>
                    <button onClick={() => addToCart(item.menuItem)} className="text-gray-500 hover:text-gray-700 active:scale-90 transition-transform cursor-pointer">
                      <Plus size={13} strokeWidth={3.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Checkout / Contact Form */}
            <form onSubmit={handlePlaceOrder} className="p-5 border-t border-gray-150 bg-slate-50/50 flex flex-col gap-4.5 shrink-0">
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <User size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    required
                    placeholder="Enter Your Name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-150 rounded-2xl text-xs focus:outline-none focus:border-orange-500 font-bold focus:ring-1 focus:ring-orange-500/20"
                  />
                </div>
                <div className="relative">
                  <Phone size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel"
                    required
                    pattern="[0-9]{10}"
                    placeholder="10-digit Mobile Number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').substring(0, 10))}
                    className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-150 rounded-2xl text-xs focus:outline-none focus:border-orange-500 font-bold focus:ring-1 focus:ring-orange-500/20"
                  />
                </div>
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
                ) : 'Place Order & Send to Kitchen'}
              </button>
            </form>

          </div>
        </div>
      )}
    </div>
  );
}
