import { useState } from 'react';
import { supabase } from '../supabase';
import { DBMenuItem, DBCategory } from '../db/types';
import { Plus, Minus, Search, ShoppingBag, Utensils, CheckCircle, ChevronRight } from 'lucide-react';

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
      setPinError('Supabase database is not initialized.');
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
        // Load menu once verified
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
      // Get the app_user_id (tenant ID)
      const { data: profile, error: profileErr } = await supabase
        .from('restaurant_profile')
        .select('app_user_id, restaurant_name')
        .eq('restaurant_code', restaurantCode)
        .single();

      if (profileErr || !profile) throw profileErr || new Error('Restaurant profile not found');
      
      setRestaurantName(profile.restaurant_name || 'Restaurant');
      setTenantId(profile.app_user_id);

      // Fetch categories & menu items
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

      // Map Supabase rows to local DB types
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

      const parsedCats: DBCategory[] = (catRes.data || []).map(r => ({
        id: r.id,
        name: r.name
      }));

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
      alert('Supabase is not initialized.');
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

  // Filter menu items
  const filteredMenuItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Early return if offline
  if (!isOnline) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#f8f9fa] p-6 text-center">
        <Utensils size={48} className="text-red-500 mb-4 animate-bounce" />
        <h1 className="text-xl font-extrabold text-gray-800">Internet connection required</h1>
        <p className="text-xs text-gray-500 mt-2">Dine-in self ordering requires a live internet connection.</p>
      </div>
    );
  }

  // 5. Success Screen
  if (orderSuccess) {
    return (
      <div className="h-screen w-screen bg-[#FAFBFC] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white border border-gray-100 rounded-3xl p-8 max-w-sm shadow-xl flex flex-col items-center gap-6">
          <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center shadow-inner animate-[pulse_2s_infinite]">
            <CheckCircle size={36} />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-800">Order Placed Successfully!</h1>
            <p className="text-[11px] text-gray-500 font-bold mt-2 leading-relaxed">
              Your order has been submitted to the kitchen. Chef will start preparing your food once confirmed. Thank you!
            </p>
          </div>
          <button
            onClick={() => setOrderSuccess(false)}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs shadow-md transition-all cursor-pointer"
          >
            Order More Items
          </button>
        </div>
      </div>
    );
  }

  // 6. Verification Screen (Enter PIN)
  if (!isVerified) {
    return (
      <div className="h-screen w-screen bg-[#FAFBFC] flex flex-col items-center justify-center p-6">
        <form onSubmit={handleVerifyPin} className="bg-white border border-gray-100 rounded-3xl p-8 max-w-sm w-full shadow-xl flex flex-col gap-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4">
              <Utensils size={28} />
            </div>
            <h1 className="text-xl font-black text-gray-800 leading-tight">Dine-in Ordering</h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1.5">Table {tableId}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Enter Table PIN</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={3}
              placeholder="e.g. 184"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-3 bg-slate-50 border border-gray-100 rounded-xl font-black text-center text-lg focus:outline-none focus:border-indigo-500 tracking-widest"
            />
            {pinError && (
              <p className="text-[10px] text-red-500 font-bold mt-1 text-center">{pinError}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={verifying || pin.length !== 3}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-extrabold rounded-xl text-xs shadow-md transition-all cursor-pointer flex justify-center items-center gap-1.5"
          >
            {verifying ? 'Verifying PIN...' : 'Access Menu'}
          </button>
        </form>
      </div>
    );
  }

  // 7. Menu Browsing Screen
  return (
    <div className="h-screen flex flex-col bg-[#FAFBFC] font-sans text-gray-800 select-none overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-5 py-4 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-base font-black text-gray-900 leading-tight truncate max-w-[200px]">{restaurantName}</h1>
          <p className="text-[9px] text-gray-400 font-black uppercase mt-0.5 tracking-wider">Table {tableId}</p>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase text-green-600 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Session Active
        </div>
      </header>

      {/* Categories & Search */}
      <div className="bg-white border-b border-gray-50 p-4 shrink-0 flex flex-col gap-3.5">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search food items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-gray-100 rounded-xl text-xs focus:outline-none focus:border-indigo-500 font-bold"
          />
        </div>
        
        {/* Categories Bar */}
        <div className="flex gap-2.5 overflow-x-auto scrollbar-hide shrink-0 pb-1">
          <button
            onClick={() => setSelectedCategory('All')}
            className={`px-3.5 py-1.5 rounded-full text-[10px] font-black tracking-wider uppercase whitespace-nowrap transition-all border cursor-pointer ${
              selectedCategory === 'All'
                ? 'bg-indigo-650 text-white border-indigo-600 shadow-sm'
                : 'bg-slate-50 text-gray-500 border-gray-100'
            }`}
          >
            All Items
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.name)}
              className={`px-3.5 py-1.5 rounded-full text-[10px] font-black tracking-wider uppercase whitespace-nowrap transition-all border cursor-pointer ${
                selectedCategory === cat.name
                  ? 'bg-indigo-650 text-white border-indigo-600 shadow-sm'
                  : 'bg-slate-50 text-gray-500 border-gray-100'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu List */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-hide pb-24">
        {loadingMenu ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredMenuItems.length === 0 ? (
          <div className="text-center py-12 text-xs font-bold text-gray-400">
            No items found matching the search.
          </div>
        ) : (
          filteredMenuItems.map((item) => {
            const cartQty = cart.find(i => i.menuItem.id === item.id)?.quantity || 0;
            return (
              <div key={item.id} className="bg-white border border-gray-100/60 rounded-2xl p-4 flex justify-between items-center shadow-sm">
                <div className="flex flex-col gap-1 min-w-0 pr-4">
                  <div className="flex items-center gap-1.5">
                    {item.dietary && (
                      <span className={`w-3 h-3 border flex items-center justify-center shrink-0 p-0.5 ${
                        item.dietary === 'veg' ? 'border-green-600 text-green-600' : 'border-red-600 text-red-600'
                      }`} style={{ borderWidth: '1.5px' }}>
                        <span className={`w-1.5 h-1.5 rounded-full ${item.dietary === 'veg' ? 'bg-green-600' : 'bg-red-600'}`} />
                      </span>
                    )}
                    <span className="font-extrabold text-[13px] text-gray-800 truncate leading-snug">{item.name}</span>
                  </div>
                  <span className="text-xs font-extrabold text-gray-900">₹{item.price.toFixed(2)}</span>
                </div>

                <div className="shrink-0">
                  {cartQty > 0 ? (
                    <div className="flex items-center gap-2.5 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100/50 rounded-xl px-2.5 py-1 text-xs">
                      <button onClick={() => updateQuantity(item.id, -1)} className="text-indigo-650 hover:text-indigo-700 active:scale-95 cursor-pointer">
                        <Minus size={14} strokeWidth={3} />
                      </button>
                      <span className="font-black text-indigo-700 w-4 text-center">{cartQty}</span>
                      <button onClick={() => addToCart(item)} className="text-indigo-650 hover:text-indigo-700 active:scale-95 cursor-pointer">
                        <Plus size={14} strokeWidth={3} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(item)}
                      className="px-4.5 py-1.5 bg-indigo-50 border border-indigo-100/50 text-indigo-650 hover:bg-indigo-100 hover:text-indigo-700 font-extrabold text-xs rounded-xl active:scale-95 cursor-pointer flex items-center justify-center gap-1"
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

      {/* Floating Cart Button */}
      {totalCartItems > 0 && !showCart && (
        <div className="absolute bottom-4 left-4 right-4 bg-indigo-600 text-white rounded-2xl p-4 flex justify-between items-center shadow-lg shadow-indigo-500/25 animate-[pulse_3s_infinite]">
          <div className="flex items-center gap-2 text-xs font-extrabold">
            <ShoppingBag size={18} />
            <span>{totalCartItems} Items | ₹{cartSubtotal.toFixed(2)}</span>
          </div>
          <button
            onClick={() => setShowCart(true)}
            className="flex items-center gap-1 text-xs font-black uppercase bg-white/10 hover:bg-white/20 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer"
          >
            View Cart
            <ChevronRight size={14} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* Cart Slider/Drawer */}
      {showCart && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-xs z-50 flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl max-h-[85%] flex flex-col shadow-2xl animate-slide-up">
            
            {/* Header */}
            <div className="px-5 py-4.5 border-b border-gray-100 flex justify-between items-center shrink-0">
              <h2 className="text-sm font-black text-gray-800">Your Cart ({totalCartItems})</h2>
              <button
                onClick={() => setShowCart(false)}
                className="text-xs font-bold text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3.5 scrollbar-hide">
              {cart.map((item) => (
                <div key={item.menuItem.id} className="flex justify-between items-center">
                  <div className="min-w-0 pr-4">
                    <p className="font-extrabold text-[12px] text-gray-800 truncate leading-snug">{item.menuItem.name}</p>
                    <p className="text-[10px] text-gray-400 font-bold mt-0.5">₹{item.menuItem.price.toFixed(2)} each</p>
                  </div>
                  <div className="flex items-center gap-2.5 bg-slate-50 border border-gray-100 rounded-xl px-2.5 py-1 text-xs shrink-0">
                    <button onClick={() => updateQuantity(item.menuItem.id, -1)} className="text-gray-500 hover:text-gray-700 active:scale-95 cursor-pointer">
                      <Minus size={14} strokeWidth={3} />
                    </button>
                    <span className="font-black text-gray-700 w-4 text-center">{item.quantity}</span>
                    <button onClick={() => addToCart(item.menuItem)} className="text-gray-500 hover:text-gray-700 active:scale-95 cursor-pointer">
                      <Plus size={14} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Customer Details Form */}
            <form onSubmit={handlePlaceOrder} className="p-5 border-t border-gray-100 bg-slate-50/50 flex flex-col gap-4 shrink-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Your Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-150 rounded-xl text-xs focus:outline-none focus:border-indigo-500 font-bold"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Mobile Number</label>
                  <input
                    type="tel"
                    required
                    pattern="[0-9]{10}"
                    placeholder="10-digit number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').substring(0, 10))}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-150 rounded-xl text-xs focus:outline-none focus:border-indigo-500 font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center text-xs font-black text-gray-800 mt-1">
                <span>Subtotal</span>
                <span>₹{cartSubtotal.toFixed(2)}</span>
              </div>

              <button
                type="submit"
                disabled={placingOrder}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs shadow-md transition-all cursor-pointer flex justify-center items-center gap-1.5"
              >
                {placingOrder ? 'Submitting Order...' : 'Send Order to Kitchen'}
              </button>
            </form>

          </div>
        </div>
      )}
    </div>
  );
}
