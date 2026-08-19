import { useState, useMemo } from 'react';
import {
  Users, Phone, Star, Trash2, Edit3, X,
  MessageSquare, Send, TrendingUp, IndianRupee,
  UserPlus, Printer, History, Cake
} from 'lucide-react';
import { useLiveQuery, db } from '../db';
import { DBPosCustomer, normalizePhone } from '../db';
import { useToast } from './Toast';

const PRESET_TAGS = ['Regular', 'VIP', 'Wholesale', 'Festival', 'Birthday', 'New'];

const BROADCAST_TEMPLATES = [
  {
    id: 'weekend',
    title: '🎉 Weekend Special Offer',
    text: 'Hello {name}! Enjoy Flat 15% OFF on your favorite dishes this weekend at our restaurant. We look forward to serving you!'
  },
  {
    id: 'festival',
    title: '✨ Season Greetings & Wishes',
    text: 'Warm greetings {name}! Wishing you and your family a wonderful festive season. Visit us to celebrate with delicious food and great memories!'
  },
  {
    id: 'vip',
    title: '⭐ VIP Exclusive Reward',
    text: 'Hello {name}! As our valued VIP customer, enjoy a complimentary chef special dessert on your next dining visit!'
  },
  {
    id: 'new_menu',
    title: '🍽️ New Menu Launch',
    text: 'Hello {name}! We have introduced exciting new culinary specials to our menu. Come and experience the new flavors today!'
  }
];

export default function Customers() {
  const { showToast } = useToast();

  // Queries
  const customersList = useLiveQuery(() => db.posCustomers.toArray(), [], 'posCustomers') || [];
  const billsList = useLiveQuery(() => db.bills.toArray(), [], 'bills') || [];

  // Filter & Search states
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [sortBy, setSortBy] = useState<'lastVisit' | 'visitCount' | 'totalSpent' | 'name'>('lastVisit');

  // Modals & Drawers
  const [showAddEdit, setShowAddEdit] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<DBPosCustomer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<DBPosCustomer | null>(null);
  const [showBroadcast, setShowBroadcast] = useState(false);

  // Form states for Add/Edit
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formBirthday, setFormBirthday] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formTags, setFormTags] = useState<string[]>([]);

  // Broadcast state
  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'vip' | 'regular'>('all');
  const [broadcastMessage, setBroadcastMessage] = useState(BROADCAST_TEMPLATES[0].text);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const formatDate = (ts?: number) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (val?: number) => `₹${(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  // ── Metrics ─────────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalCount = customersList.length;
    const totalSpent = customersList.reduce((acc, c) => acc + (c.totalSpent || 0), 0);
    const avgSpend = totalCount > 0 ? Math.round(totalSpent / totalCount) : 0;
    const repeatCount = customersList.filter(c => (c.visitCount || 0) > 1).length;
    const repeatPercent = totalCount > 0 ? Math.round((repeatCount / totalCount) * 100) : 0;

    return { totalCount, totalSpent, avgSpend, repeatCount, repeatPercent };
  }, [customersList]);

  // ── Filtered & Sorted Customer List ──────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return customersList
      .filter(c => {
        const matchesQuery =
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.email || '').toLowerCase().includes(q);

        const matchesTag = !selectedTag || (c.tags || []).includes(selectedTag);

        return matchesQuery && matchesTag;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'visitCount') return (b.visitCount || 0) - (a.visitCount || 0);
        if (sortBy === 'totalSpent') return (b.totalSpent || 0) - (a.totalSpent || 0);
        return (b.lastVisit || 0) - (a.lastVisit || 0);
      });
  }, [customersList, search, selectedTag, sortBy]);

  // ── Customer Order History ──────────────────────────────────────────────────
  const customerBills = useMemo(() => {
    if (!viewingCustomer) return [];
    const cleanPhone = normalizePhone(viewingCustomer.phone);
    return billsList
      .filter(b => {
        const bPhone = normalizePhone(b.customerPhone || '');
        return bPhone && bPhone === cleanPhone;
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [billsList, viewingCustomer]);

  // ── Add / Edit Customer Actions ─────────────────────────────────────────────
  const openAddCustomer = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormBirthday('');
    setFormNotes('');
    setFormTags(['Regular']);
    setShowAddEdit(true);
  };

  const openEditCustomer = (c: DBPosCustomer) => {
    setEditingCustomer(c);
    setFormName(c.name);
    setFormPhone(c.phone);
    setFormEmail(c.email || '');
    setFormAddress(c.address || '');
    setFormBirthday(c.birthday || '');
    setFormNotes(c.notes || '');
    setFormTags(c.tags || []);
    setShowAddEdit(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    const phone = normalizePhone(formPhone);

    if (!name) {
      showToast('⚠️ Customer name is required.', 'error');
      return;
    }
    if (!phone || phone.length < 10) {
      showToast('⚠️ Please enter a valid 10-digit mobile number.', 'error');
      return;
    }

    try {
      if (!editingCustomer) {
        const existing = await db.posCustomers.dexieTable.where('phone').equals(phone).first();
        if (existing) {
          showToast('⚠️ This phone number is already registered.', 'error');
          return;
        }
      }

      const customerRecord: DBPosCustomer = {
        id: editingCustomer?.id || crypto.randomUUID(),
        name,
        phone,
        email: formEmail.trim() || undefined,
        address: formAddress.trim() || undefined,
        birthday: formBirthday || undefined,
        visitCount: editingCustomer?.visitCount || 0,
        totalSpent: editingCustomer?.totalSpent || 0,
        lastVisit: editingCustomer?.lastVisit || Date.now(),
        createdAt: editingCustomer?.createdAt || Date.now(),
        tags: formTags,
        notes: formNotes.trim() || undefined,
      };

      await db.posCustomers.put(customerRecord);
      showToast(editingCustomer ? `✅ Customer profile updated successfully!` : `🎉 Customer added successfully!`);
      setShowAddEdit(false);

      if (viewingCustomer?.id === customerRecord.id) {
        setViewingCustomer(customerRecord);
      }
    } catch (err: any) {
      console.error('Error saving customer:', err);
      showToast('⚠️ Error saving customer details.', 'error');
    }
  };

  const handleDeleteCustomer = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name} from customer database?`)) return;
    try {
      await db.posCustomers.delete(id);
      showToast(`🗑️ ${name} deleted.`);
      if (viewingCustomer?.id === id) setViewingCustomer(null);
    } catch (err) {
      showToast('⚠️ Failed to delete customer.', 'error');
    }
  };

  const toggleTag = (tag: string) => {
    setFormTags(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]));
  };

  // ── WhatsApp Broadcast Action ───────────────────────────────────────────────
  const handleSendBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      showToast('⚠️ Please write a broadcast message.', 'error');
      return;
    }

    const targets = customersList.filter(c => {
      if (broadcastTarget === 'vip') return (c.tags || []).includes('VIP');
      if (broadcastTarget === 'regular') return (c.tags || []).includes('Regular');
      return true;
    }).filter(c => c.phone);

    if (targets.length === 0) {
      showToast('⚠️ No customers found in selected category.', 'error');
      return;
    }

    let sent = 0;
    for (const c of targets) {
      const clean = c.phone.replace(/\D/g, '');
      if (clean.length < 10) continue;
      const personalized = broadcastMessage.replace('{name}', c.name);
      const url = `https://wa.me/91${clean}?text=${encodeURIComponent(personalized)}`;
      window.open(url, '_blank');
      sent++;
      await new Promise(r => setTimeout(r, 450));
    }

    showToast(`🚀 WhatsApp broadcast opened for ${sent} customers!`);
    setShowBroadcast(false);
  };

  // ── Print Customer Directory ────────────────────────────────────────────────
  const printCustomerDirectory = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      showToast('⚠️ Pop-up blocked! Please allow pop-ups to print directory.', 'error');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Customer Database Directory</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; font-size: 11px; color: #1e293b; }
            h1 { font-size: 18px; margin: 0 0 4px 0; color: #0f172a; text-transform: uppercase; }
            .subtitle { font-size: 11px; color: #64748b; margin-bottom: 16px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
            th { background-color: #f1f5f9; font-weight: bold; color: #334155; }
            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; background: #e0e7ff; color: #4338ca; }
          </style>
        </head>
        <body>
          <h1>Customer Directory</h1>
          <div class="subtitle">Total Customers: ${filteredCustomers.length} | Generated on: ${new Date().toLocaleDateString('en-US')}</div>
          <table>
            <thead>
              <tr>
                <th style="width: 30px;">#</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Tags</th>
                <th>Visits</th>
                <th>Total Spent</th>
                <th>Last Visit</th>
              </tr>
            </thead>
            <tbody>
              ${filteredCustomers.map((c, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td><strong>${c.name}</strong></td>
                  <td>${c.phone}</td>
                  <td>${(c.tags || []).map(t => `<span class="badge">${t}</span>`).join(' ')}</td>
                  <td>${c.visitCount || 0}</td>
                  <td><strong>₹${(c.totalSpent || 0).toLocaleString()}</strong></td>
                  <td>${formatDate(c.lastVisit)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="h-full flex flex-col bg-slate-50/60 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 overflow-hidden font-sans select-none transition-colors">
      
      {/* ── TOP HEADER ───────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-white dark:bg-slate-900/90 border-b border-slate-200/80 dark:border-slate-800/80 px-6 py-4.5 shrink-0 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 text-white rounded-2xl shadow-lg shadow-indigo-500/25 flex items-center justify-center shrink-0">
              <Users size={22} className="stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                  Customer Database &amp; CRM
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/50">
                  {metrics.totalCount} Registered
                </span>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                Track customer visits, order history, VIP rewards, and WhatsApp promotions
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={printCustomerDirectory}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
              title="Print Customer Directory"
            >
              <Printer size={15} />
              Print
            </button>

            <button
              onClick={() => setShowBroadcast(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <MessageSquare size={15} />
              WhatsApp Broadcast
            </button>

            <button
              onClick={openAddCustomer}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <UserPlus size={15} />
              + Add Customer
            </button>
          </div>
        </div>
      </div>

      {/* ── 4 KPI CARDS ──────────────────────────────────────────────────────── */}
      <div className="px-6 pt-4 shrink-0">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          
          <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Users size={20} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400">Total Customers</p>
              <p className="text-base font-black text-slate-900 dark:text-slate-100">{metrics.totalCount}</p>
            </div>
          </div>

          <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <IndianRupee size={20} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400">Total Revenue</p>
              <p className="text-base font-black text-slate-900 dark:text-slate-100">{formatCurrency(metrics.totalSpent)}</p>
            </div>
          </div>

          <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400">Average Spend</p>
              <p className="text-base font-black text-slate-900 dark:text-slate-100">{formatCurrency(metrics.avgSpend)}</p>
            </div>
          </div>

          <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Star size={20} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400">Repeat Customers</p>
              <p className="text-base font-black text-slate-900 dark:text-slate-100">
                {metrics.repeatCount} <span className="text-xs font-bold text-purple-600">({metrics.repeatPercent}%)</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── FILTER & SEARCH TOOLBAR (NO ICONS IN INPUTS) ────────────────────── */}
      <div className="px-6 pt-4 shrink-0">
        <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
          
          {/* Clean Search Input without internal icons */}
          <div className="relative w-full md:w-80">
            <input
              type="text"
              placeholder="Search customer name, mobile, email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/60 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Tag Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide w-full md:w-auto">
            <button
              onClick={() => setSelectedTag('')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedTag === ''
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              All ({customersList.length})
            </button>
            {PRESET_TAGS.map(tag => {
              const count = customersList.filter(c => (c.tags || []).includes(tag)).length;
              return (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag === selectedTag ? '' : tag)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    selectedTag === tag
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {tag} ({count})
                </button>
              );
            })}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-slate-400">Sort:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 outline-none cursor-pointer"
            >
              <option value="lastVisit">Last Visit</option>
              <option value="totalSpent">Highest Spend (₹)</option>
              <option value="visitCount">Most Visits</option>
              <option value="name">Name (A to Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── CUSTOMER CARDS GRID ──────────────────────────────────────────────── */}
      <div className="flex-1 p-6 overflow-y-auto">
        {filteredCustomers.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-16 text-center flex flex-col items-center justify-center shadow-xs">
            <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
              <Users size={32} />
            </div>
            <h3 className="text-base font-black text-slate-800 dark:text-slate-200">
              {search || selectedTag ? 'No matching customers found' : 'No customers registered yet'}
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-5 max-w-sm">
              {search || selectedTag ? 'Try searching with another name or phone number.' : 'Add your first customer to track billing, visits and order history.'}
            </p>
            <button
              onClick={openAddCustomer}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 cursor-pointer"
            >
              + Add New Customer
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredCustomers.map(c => {
              const cleanPhone = c.phone.replace(/\D/g, '');

              return (
                <div
                  key={c.id}
                  className="bg-white dark:bg-slate-900/90 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 p-5 shadow-xs flex flex-col justify-between gap-4 transition-all hover:shadow-md hover:border-indigo-500/40 group"
                >
                  {/* Top Row: Avatar + Name + Tags + Actions */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 text-white font-black text-base flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-black text-sm text-slate-900 dark:text-slate-100 tracking-tight leading-snug">
                          {c.name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold mt-0.5">
                          <Phone size={12} className="text-indigo-500" />
                          <span>{c.phone}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditCustomer(c)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Edit Customer"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeleteCustomer(c.id, c.name)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Delete Customer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5">
                    {(c.tags || []).map(t => (
                      <span
                        key={t}
                        className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                          t === 'VIP'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                            : t === 'Regular'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
                        }`}
                      >
                        {t}
                      </span>
                    ))}
                    {c.birthday && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20 flex items-center gap-1">
                        <Cake size={11} /> {c.birthday}
                      </span>
                    )}
                  </div>

                  {/* Spend & Visit Details */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl text-xs border border-slate-100 dark:border-slate-800/80 text-center">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Total Spent</span>
                      <strong className="font-black text-emerald-600 dark:text-emerald-400 text-xs">
                        {formatCurrency(c.totalSpent)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Visits</span>
                      <strong className="font-black text-slate-800 dark:text-slate-100 text-xs">
                        {c.visitCount || 0}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Last Visit</span>
                      <strong className="font-bold text-slate-600 dark:text-slate-300 text-[11px]">
                        {formatDate(c.lastVisit)}
                      </strong>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href={`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(`Hello ${c.name}!`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs rounded-xl border border-emerald-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare size={13} />
                      WhatsApp
                    </a>

                    <a
                      href={`tel:${c.phone}`}
                      className="py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition-all flex items-center justify-center gap-1 cursor-pointer"
                      title="Call"
                    >
                      <Phone size={13} />
                    </a>

                    <button
                      onClick={() => setViewingCustomer(c)}
                      className="py-2 px-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-black text-xs rounded-xl border border-indigo-500/20 transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <History size={13} />
                      History
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAL: ADD / EDIT CUSTOMER ──────────────────────────────────────── */}
      {showAddEdit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <UserPlus size={18} />
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                  {editingCustomer ? 'Edit Customer Details' : 'Add New Customer'}
                </h3>
              </div>
              <button onClick={() => setShowAddEdit(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="flex flex-col gap-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Customer Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="9876543210"
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Email Address (Optional)</label>
                  <input
                    type="email"
                    placeholder="customer@gmail.com"
                    value={formEmail}
                    onChange={e => setFormEmail(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Birthday (Optional)</label>
                  <input
                    type="date"
                    value={formBirthday}
                    onChange={e => setFormBirthday(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Address / Locality</label>
                <input
                  type="text"
                  placeholder="e.g. Flat 402, Green Avenue"
                  value={formAddress}
                  onChange={e => setFormAddress(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1.5">Customer Tags &amp; Category</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_TAGS.map(tag => (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        formTags.includes(tag)
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {tag} {formTags.includes(tag) && '✓'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Special Preferences / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Prefers window table, less spicy"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddEdit(false)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 cursor-pointer"
                >
                  {editingCustomer ? 'Update Customer' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CUSTOMER ORDER HISTORY & PROFILE ─────────────────────────── */}
      {viewingCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            
            {/* Top Profile Summary */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 text-white font-black text-xl flex items-center justify-center shadow-lg shadow-indigo-500/25 shrink-0">
                  {viewingCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">{viewingCustomer.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 font-bold">
                    <Phone size={12} className="text-indigo-500" />
                    <span>{viewingCustomer.phone}</span>
                    {viewingCustomer.email && (
                      <>
                        <span>•</span>
                        <span>{viewingCustomer.email}</span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(viewingCustomer.tags || []).map(t => (
                      <span key={t} className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <button onClick={() => setViewingCustomer(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            {/* Spend Stats Bar */}
            <div className="grid grid-cols-3 gap-2 my-4 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 text-center shrink-0">
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Total Spent</span>
                <strong className="font-black text-emerald-600 text-sm">{formatCurrency(viewingCustomer.totalSpent)}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Total Visits</span>
                <strong className="font-black text-slate-800 dark:text-slate-100 text-sm">{viewingCustomer.visitCount || 0} Visits</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Customer Since</span>
                <strong className="font-bold text-slate-600 dark:text-slate-300 text-xs">{formatDate(viewingCustomer.createdAt)}</strong>
              </div>
            </div>

            {/* Notes */}
            {viewingCustomer.notes && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200/60 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-300 mb-3 shrink-0">
                💬 <strong>Notes:</strong> {viewingCustomer.notes}
              </div>
            )}

            {/* Order / Bill History List */}
            <div className="flex-1 overflow-y-auto">
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-2 flex items-center gap-1.5">
                <History size={14} className="text-indigo-500" />
                Past Order History ({customerBills.length} Bills)
              </h4>

              {customerBills.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-xs font-bold">
                  No billing history recorded for this customer.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {customerBills.map(b => (
                    <div key={b.id} className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xs text-slate-900 dark:text-slate-100">
                            Bill #{b.billNumber || b.id.slice(0, 6)}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 uppercase">
                            {b.paymentMethod || 'Cash'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {formatDate(b.timestamp)} • {b.items?.length || 0} Items
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                          ₹{b.total.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: WHATSAPP BROADCAST ────────────────────────────────────────── */}
      {showBroadcast && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                    WhatsApp Promotional Broadcast
                  </h3>
                  <p className="text-[11px] text-slate-400">Send offers &amp; greetings directly to customer WhatsApp</p>
                </div>
              </div>
              <button onClick={() => setShowBroadcast(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              
              {/* Target Audience */}
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1.5">Target Audience</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'all', label: `All (${customersList.length})` },
                    { id: 'vip', label: `VIP Only (${customersList.filter(c => (c.tags || []).includes('VIP')).length})` },
                    { id: 'regular', label: `Regular (${customersList.filter(c => (c.tags || []).includes('Regular')).length})` }
                  ].map(t => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setBroadcastTarget(t.id as any)}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                        broadcastTarget === t.id
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ready Templates */}
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1.5">Message Templates</label>
                <div className="grid grid-cols-2 gap-2">
                  {BROADCAST_TEMPLATES.map(tpl => (
                    <button
                      type="button"
                      key={tpl.id}
                      onClick={() => setBroadcastMessage(tpl.text)}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-left hover:border-emerald-500 transition-all cursor-pointer"
                    >
                      <span className="font-black text-xs text-slate-800 dark:text-slate-200 block">{tpl.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Message Input */}
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Message Text (<code>{'{name}'}</code> will be auto-replaced with customer name)
                </label>
                <textarea
                  rows={4}
                  value={broadcastMessage}
                  onChange={e => setBroadcastMessage(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold outline-none focus:border-emerald-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBroadcast(false)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendBroadcast}
                  className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-500/20 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Send size={15} />
                  Start Broadcast
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
