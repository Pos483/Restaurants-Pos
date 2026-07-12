import { useState, useEffect, useRef } from 'react';
import { Users, Search, Phone, Mail, MapPin, Star, Trash2, Edit3, X, MessageSquare, Send, TrendingUp, Calendar, IndianRupee, Check, UserPlus } from 'lucide-react';
import { db, DBPosCustomer, normalizePhone } from '../db';
import { useToast } from './Toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TAGS = ['Regular', 'VIP', 'Wholesale', 'Festival', 'Birthday', 'New'];

const formatDate = (ts: number) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('hi-IN', { day: '2-digit', month: 'short', year: '2-digit' });
};

const formatCurrency = (val: number) => `₹${(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// ── Main Component ────────────────────────────────────────────────────────────

export default function Customers() {
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<DBPosCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [sortBy, setSortBy] = useState<'lastVisit' | 'visitCount' | 'totalSpent' | 'name'>('lastVisit');
  const [selectedCustomer, setSelectedCustomer] = useState<DBPosCustomer | null>(null);
  const [showAddEdit, setShowAddEdit] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [editData, setEditData] = useState<Partial<DBPosCustomer>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastFilter, setBroadcastFilter] = useState('all');
  const [selectedForBroadcast, setSelectedForBroadcast] = useState<string[]>([]);
  void setSelectedForBroadcast; // suppress TS6133 - reserved for future multi-select
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Data Loading ──────────────────────────────────────────────────────────

  const loadCustomers = async () => {
    try {
      const all = await db.posCustomers.toArray();
      setCustomers(all);
    } catch (err) {
      console.error('Error loading customers:', err);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  // ── Filtered + Sorted List ────────────────────────────────────────────────

  const filtered = customers
    .filter(c => {
      const q = search.toLowerCase();
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email || '').toLowerCase().includes(q);
      const matchTag = !filterTag || (c.tags || []).includes(filterTag);
      return matchSearch && matchTag;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'visitCount') return (b.visitCount || 0) - (a.visitCount || 0);
      if (sortBy === 'totalSpent') return (b.totalSpent || 0) - (a.totalSpent || 0);
      return (b.lastVisit || 0) - (a.lastVisit || 0);
    });

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditData({ visitCount: 0, totalSpent: 0, createdAt: Date.now(), lastVisit: Date.now() });
    setIsEditing(false);
    setShowAddEdit(true);
  };

  const openEdit = (c: DBPosCustomer) => {
    setEditData({ ...c });
    setIsEditing(true);
    setShowAddEdit(true);
  };

  const saveCustomer = async () => {
    const name = (editData.name || '').trim();
    const phone = normalizePhone(editData.phone || '');
    if (!name) { showToast('Name is required', 'error'); return; }
    if (!phone || phone.length < 10) { showToast('A valid 10-digit phone number is required', 'error'); return; }

    // Duplicate check
    const existing = await db.posCustomers.dexieTable.where('phone').equals(phone).first();
    if (!isEditing && existing) {
      showToast('This phone number is already saved', 'error');
      return;
    }

    const record: DBPosCustomer = {
      id: editData.id || crypto.randomUUID(),
      name,
      phone,
      email: (editData.email || '').trim() || undefined,
      address: (editData.address || '').trim() || undefined,
      birthday: editData.birthday || undefined,
      visitCount: editData.visitCount || 0,
      totalSpent: editData.totalSpent || 0,
      lastVisit: editData.lastVisit || Date.now(),
      createdAt: editData.createdAt || Date.now(),
      tags: editData.tags || [],
      notes: (editData.notes || '').trim() || undefined,
    };
    await db.posCustomers.put(record);
    showToast(isEditing ? 'Customer updated!' : 'Customer added!', 'success');
    setShowAddEdit(false);
    if (selectedCustomer?.id === record.id) setSelectedCustomer(record);
    loadCustomers();
  };

  const deleteCustomer = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;
    await db.posCustomers.delete(id);
    if (selectedCustomer?.id === id) setSelectedCustomer(null);
    showToast('Customer deleted', 'success');
    loadCustomers();
  };

  const toggleTag = (tag: string) => {
    const tags = editData.tags || [];
    setEditData({ ...editData, tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag] });
  };

  // ── Broadcast ─────────────────────────────────────────────────────────────

  const broadcastTargets = customers.filter(c => {
    if (broadcastFilter === 'vip') return (c.tags || []).includes('VIP');
    if (broadcastFilter === 'regular') return (c.tags || []).includes('Regular');
    return true;
  }).filter(c => c.phone);

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim()) { showToast('Please write a message', 'error'); return; }
    const targets = broadcastFilter === 'selected' ? customers.filter(c => selectedForBroadcast.includes(c.id)) : broadcastTargets;
    if (targets.length === 0) { showToast('No matching customers found', 'error'); return; }

    let sent = 0;
    for (const c of targets) {
      const phone = c.phone.replace(/\D/g, '');
      if (phone.length < 10) continue;
      const url = `https://wa.me/91${phone}?text=${encodeURIComponent(broadcastMsg)}`;
      window.open(url, '_blank');
      sent++;
      await new Promise(r => setTimeout(r, 400));
    }
    showToast(`WhatsApp sent to ${sent} customers!`, 'success');
    setBroadcastMsg('');
    setShowBroadcast(false);
  };

  // ── Stats ─────────────────────────────────────────────────────────────────

  const totalCustomers = customers.length;
  const totalRevenue = customers.reduce((s, c) => s + (c.totalSpent || 0), 0);
  const avgSpend = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
  const repeatCustomers = customers.filter(c => (c.visitCount || 0) > 1).length;

  // ── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-4 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-gray-800 dark:text-slate-100 flex items-center gap-2 tracking-tight">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl text-indigo-600 dark:text-indigo-400">
              <Users size={20} />
            </div>
            Customer Database
          </h2>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 font-medium">Track customers, send promotional messages</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBroadcast(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-green-200/50 dark:shadow-green-900/30">
            <MessageSquare size={16} /> WhatsApp Broadcast
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-indigo-200/50 dark:shadow-indigo-900/30">
            <UserPlus size={16} /> Add Customer
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Customers', value: totalCustomers, icon: <Users size={16} />, color: 'indigo' },
          { label: 'Total Revenue', value: formatCurrency(totalRevenue), icon: <IndianRupee size={16} />, color: 'green' },
          { label: 'Avg Spend', value: formatCurrency(avgSpend), icon: <TrendingUp size={16} />, color: 'amber' },
          { label: 'Repeat Customers', value: repeatCustomers, icon: <Star size={16} />, color: 'purple' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900/60 border border-gray-100 dark:border-slate-800 rounded-2xl p-4 flex flex-col gap-1.5 shadow-sm">
            <div className={`text-${s.color}-500 dark:text-${s.color}-400`}>{s.icon}</div>
            <div className="text-xl font-black text-gray-800 dark:text-slate-100">{s.value}</div>
            <div className="text-[11px] text-gray-400 dark:text-slate-500 font-semibold">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone…" className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-medium bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500" />
        </div>
        <select title="Filter by tag" value={filterTag} onChange={e => setFilterTag(e.target.value)} className="px-3 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none">
          <option value="">All Tags</option>
          {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select title="Sort order" value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="px-3 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none">
          <option value="lastVisit">Last Visit</option>
          <option value="visitCount">Most Visits</option>
          <option value="totalSpent">Highest Spend</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {/* Customer List + Detail Panel */}
      <div className="flex flex-1 gap-4 overflow-hidden min-h-0">
        {/* List */}
        <div className={`flex flex-col gap-2 overflow-y-auto ${selectedCustomer ? 'hidden sm:flex sm:w-[340px] shrink-0' : 'w-full'}`}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-slate-500 gap-3">
              <Users size={40} className="opacity-30" />
              <p className="font-bold text-sm">{search || filterTag ? 'No customers found' : 'No customers yet'}</p>
              {!search && !filterTag && <button onClick={openAdd} className="text-indigo-600 text-xs font-bold hover:underline">+ Add your first customer</button>}
            </div>
          ) : filtered.map(c => (
            <div
              key={c.id}
              onClick={() => setSelectedCustomer(c)}
              className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${selectedCustomer?.id === c.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 shadow-md shadow-indigo-100/50' : 'border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-indigo-200 dark:hover:border-indigo-900/50 hover:shadow-sm'}`}
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-800 dark:text-slate-100 text-sm truncate">{c.name}</div>
                <div className="text-xs text-gray-400 dark:text-slate-500 font-medium">{c.phone}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(c.tags || []).map(t => (
                    <span key={t} className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">{t}</span>
                  ))}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-black text-gray-700 dark:text-slate-300">{formatCurrency(c.totalSpent)}</div>
                <div className="text-[10px] text-gray-400 dark:text-slate-500 font-semibold">{c.visitCount || 0} visits</div>
              </div>
            </div>
          ))}
          <div className="pb-4 text-center text-xs text-gray-300 dark:text-slate-700 font-semibold pt-2">{filtered.length} customers</div>
        </div>

        {/* Detail Panel */}
        {selectedCustomer && (
          <div className="flex-1 bg-white dark:bg-slate-900/60 border border-gray-100 dark:border-slate-800 rounded-2xl p-5 overflow-y-auto shadow-sm flex flex-col gap-5">
            {/* Back on Mobile */}
            <button onClick={() => setSelectedCustomer(null)} className="sm:hidden flex items-center gap-1 text-indigo-600 text-sm font-bold mb-1">
              ← Back
            </button>
            {/* Top */}
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-black text-2xl shadow-lg shrink-0">
                {selectedCustomer.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-black text-gray-800 dark:text-slate-100 truncate">{selectedCustomer.name}</h3>
                <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500 dark:text-slate-400 font-medium">
                  <Phone size={13} /> {selectedCustomer.phone}
                </div>
                {selectedCustomer.email && <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-400 dark:text-slate-500 font-medium"><Mail size={12} />{selectedCustomer.email}</div>}
                {selectedCustomer.address && <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-400 dark:text-slate-500 font-medium"><MapPin size={12} />{selectedCustomer.address}</div>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(selectedCustomer.tags || []).map(t => (
                    <span key={t} className="text-[11px] font-black px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">{t}</span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button title="Edit customer" onClick={() => openEdit(selectedCustomer)} className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-xl transition-colors">
                  <Edit3 size={16} />
                </button>
                <button title="Delete customer" onClick={() => deleteCustomer(selectedCustomer.id)} className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Visits', value: selectedCustomer.visitCount || 0, icon: <Calendar size={15} />, color: 'indigo' },
                { label: 'Total Spent', value: formatCurrency(selectedCustomer.totalSpent), icon: <IndianRupee size={15} />, color: 'green' },
                { label: 'Last Visit', value: formatDate(selectedCustomer.lastVisit), icon: <TrendingUp size={15} />, color: 'amber' },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 dark:bg-slate-800/60 rounded-xl p-3 flex flex-col gap-1">
                  <div className={`text-${s.color}-500 dark:text-${s.color}-400`}>{s.icon}</div>
                  <div className="text-base font-black text-gray-800 dark:text-slate-100">{s.value}</div>
                  <div className="text-[10px] text-gray-400 dark:text-slate-500 font-semibold uppercase tracking-wider">{s.label}</div>
                </div>
              ))}
            </div>

            {selectedCustomer.birthday && (
              <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl px-4 py-2.5">
                <span className="text-lg">🎂</span>
                <span className="text-sm font-bold text-amber-700 dark:text-amber-400">Birthday: {selectedCustomer.birthday}</span>
              </div>
            )}

            {selectedCustomer.notes && (
              <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl p-4">
                <div className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Notes</div>
                <p className="text-sm text-gray-700 dark:text-slate-300 font-medium">{selectedCustomer.notes}</p>
              </div>
            )}

            {/* WhatsApp Action */}
            <div className="mt-auto flex gap-2 flex-wrap">
              <a
                href={`https://wa.me/91${selectedCustomer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Namaste ${selectedCustomer.name}! 🙏`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm transition-all"
              >
                <MessageSquare size={15} /> WhatsApp Message
              </a>
              {selectedCustomer.phone && (
                <a href={`tel:${selectedCustomer.phone}`} className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl font-bold text-sm transition-all">
                  <Phone size={15} /> Call
                </a>
              )}
            </div>

            <div className="text-[11px] text-gray-300 dark:text-slate-700 font-semibold text-right">Added: {formatDate(selectedCustomer.createdAt)}</div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddEdit && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAddEdit(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 dark:border-slate-800 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="font-black text-lg text-gray-800 dark:text-slate-100 flex items-center gap-2">
                <UserPlus size={20} className="text-indigo-500" />
                {isEditing ? 'Edit Customer' : 'Add Customer'}
              </h3>
              <button title="Close" onClick={() => setShowAddEdit(false)} className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full"><X size={18} /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">Name *</label>
                <input type="text" value={editData.name || ''} onChange={e => setEditData({ ...editData, name: e.target.value })} placeholder="Customer Name" className="p-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">Phone *</label>
                <input type="text" value={editData.phone || ''} onChange={e => setEditData({ ...editData, phone: e.target.value })} placeholder="10-digit" className="p-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">Email</label>
                <input type="email" data-no-capitalize value={editData.email || ''} onChange={e => setEditData({ ...editData, email: e.target.value })} placeholder="email@example.com" className="p-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">Birthday</label>
                <input title="Birthday" type="date" placeholder="YYYY-MM-DD" value={editData.birthday || ''} onChange={e => setEditData({ ...editData, birthday: e.target.value })} className="p-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">Address</label>
                <input type="text" value={editData.address || ''} onChange={e => setEditData({ ...editData, address: e.target.value })} placeholder="Ghar/Shop Address" className="p-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">Notes</label>
                <textarea value={editData.notes || ''} onChange={e => setEditData({ ...editData, notes: e.target.value })} rows={2} placeholder="Koi khaas baat..." className="p-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">Tags</label>
              <div className="flex flex-wrap gap-2">
                {TAGS.map(t => {
                  const active = (editData.tags || []).includes(t);
                  return (
                    <button key={t} type="button" onClick={() => toggleTag(t)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:border-indigo-400'}`}>
                      {active && <Check size={11} />}{t}
                    </button>
                  );
                })}
              </div>
            </div>

            <button onClick={saveCustomer} className="mt-2 w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-base transition-all shadow-lg shadow-indigo-200/50 dark:shadow-indigo-900/30">
              {isEditing ? 'Update Customer' : 'Save Customer'}
            </button>
          </div>
        </div>
      )}

      {/* WhatsApp Broadcast Modal */}
      {showBroadcast && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowBroadcast(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-lg shadow-2xl border border-gray-100 dark:border-slate-800 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="font-black text-lg text-gray-800 dark:text-slate-100 flex items-center gap-2">
                <MessageSquare size={20} className="text-green-500" /> WhatsApp Broadcast
              </h3>
              <button title="Close" onClick={() => setShowBroadcast(false)} className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full"><X size={18} /></button>
            </div>

            {/* Filter */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">Customers Select Karein</label>
              <select title="Select customer group" value={broadcastFilter} onChange={e => setBroadcastFilter(e.target.value)} className="p-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold bg-white dark:bg-slate-800 dark:text-white focus:outline-none">
                <option value="all">Saare Customers ({customers.filter(c => c.phone).length})</option>
                <option value="vip">Sirf VIP Customers ({customers.filter(c => (c.tags || []).includes('VIP')).length})</option>
                <option value="regular">Sirf Regular Customers ({customers.filter(c => (c.tags || []).includes('Regular')).length})</option>
              </select>
            </div>

            {/* Message Templates */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">Quick Templates</label>
              <div className="flex flex-wrap gap-2">
                {[
                  '🎉 Check out our latest offers! Special discounts exclusively for valued customers like you.',
                  '🍽️ You are welcome! Visit us today and enjoy our special menu.',
                  '🎂 Wishing you a very Happy Birthday! Come today and get a special discount! 🎁',
                ].map((tmpl, i) => (
                  <button key={i} type="button" onClick={() => setBroadcastMsg(tmpl)} className="text-left text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 rounded-xl px-3 py-2 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors line-clamp-1">
                    {tmpl.slice(0, 60)}…
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">Message</label>
              <textarea
                value={broadcastMsg}
                onChange={e => setBroadcastMsg(e.target.value)}
                rows={4}
                placeholder="Write your promotional message…"
                className="p-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
              />
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl p-3 text-xs font-medium text-amber-700 dark:text-amber-400">
              💡 WhatsApp will open individually for each customer. Please allow popups in your browser.
            </div>

            <button onClick={sendBroadcast} className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-base transition-all shadow-lg flex items-center justify-center gap-2">
              <Send size={16} />
              Send to {broadcastFilter === 'all' ? customers.filter(c => c.phone).length : broadcastFilter === 'vip' ? customers.filter(c => (c.tags || []).includes('VIP')).length : customers.filter(c => (c.tags || []).includes('Regular')).length} Customers
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
