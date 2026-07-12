import { useState, useEffect } from 'react';
import { Mail, Phone, MessageSquare, Send, Sparkles, AlertCircle, HelpCircle, CheckCircle2, ShieldCheck, Clock, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react';
import { useToast } from './Toast';
import { supabase } from '../supabase';
import { logger } from '../utils/logger';

export default function HelpSupport() {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [issueType, setIssueType] = useState('bug');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  // Tickets state
  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [newReplyText, setNewReplyText] = useState<Record<string, string>>({});
  const [isReplying, setIsReplying] = useState(false);

  const faqs = [
    {
      q: "1. How and when is stock deducted for items linked to the inventory upon bill settlement?",
      a: "When you settle a bill using 'Quick Billing' or 'Order Menu (Table Orders)', the system automatically checks in the background if that item is connected to the stock inventory (via Menu Item settings). If linked, the exact quantities (according to 'stockQtyPerUnit') are deducted, and an automated 'out' transaction is created in Stock Management."
    },
    {
      q: "2. Does deleting a bill from the Dashboard revert the raw stock inventory?",
      a: "Yes, absolutely! Our system has complete automatic transaction tracking. When you delete a generated bill from the Dashboard, the system scans the linked stock transaction history and auto-reverts the deducted raw stock quantities, safely adding them back to the inventory."
    },
    {
      q: "3. What does the system do if an item runs out of stock?",
      a: "When a raw stock quantity of an item becomes low or zero, its card is automatically dimmed in 'Quick Billing' and 'Order Menu', and a red pulsing 'OUT OF STOCK' badge is displayed. Clicking on such items shows an error warning, and they cannot be added to the cart until a new stock purchase is recorded."
    },
    {
      q: "4. How are multiple orders (KOT) and checkouts managed for Dine-In tables?",
      a: "In the Dine-In (Tables) section, each active table has a custom order panel. You can select a table and generate KOTs to send orders to the kitchen. Once the meal is complete, you can select a payment method (Cash, Card, UPI) and generate a receipt directly."
    },
    {
      q: "5. How do I troubleshoot thermal printer connections and auto-connection?",
      a: "You can check the printer connection status by clicking 'Connect Printer' in the header bar. When the hardware refreshes, our auto-connect system restores active USB connections in the background, allowing dynamic bills to print instantly."
    },
    {
      q: "6. Is an active internet connection required to run the software?",
      a: "Yes, our POS system utilizes real-time cloud sync. An active internet connection is required so that your menu data and generated bills are instantly and safely backed up to the cloud server (Supabase)."
    }
  ];

  const fetchTickets = async () => {
    if (!supabase) return;
    setTicketsLoading(true);
    try {
      let userId = localStorage.getItem('activeUserId') || '';
      if (!userId) {
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id || '';
      }
      if (userId) {
        const { data, error } = await supabase
          .from('support_tickets')
          .select('*')
          .eq('app_user_id', userId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          setTickets(data);
        }
      }
    } catch (err) {
      console.error('Failed to load support tickets:', err);
    } finally {
      setTicketsLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !subject || !message) {
      showToast('Please fill out all required fields!', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      if (!supabase) {
        throw new Error('Offline: Could not connect to cloud server');
      }

      let userId = localStorage.getItem('activeUserId') || '';
      if (!userId) {
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id || '';
      }

      // Fetch restaurant settings to get code and name
      const { data: settingsData } = await supabase
        .from('settings')
        .select('data')
        .eq('app_user_id', userId)
        .eq('id', 'global')
        .maybeSingle();

      let restCode = 'UNKNOWN';
      let restName = 'Unknown Restaurant';
      if (settingsData && settingsData.data) {
        restCode = settingsData.data.restaurantCode || 'UNKNOWN';
        restName = settingsData.data.restaurantName || 'Unknown Restaurant';
      }

      const priority = issueType === 'bug' ? 'high' : issueType === 'printer' ? 'high' : 'medium';
      
      const { error } = await supabase
        .from('support_tickets')
        .insert({
          app_user_id: userId,
          restaurant_code: restCode,
          restaurant_name: restName,
          category: issueType,
          subject: subject,
          description: message,
          priority: priority,
          status: 'open',
          replies: []
        });

      if (error) throw error;

      showToast('🎉 Support ticket submitted successfully!', 'success');
      setSubject('');
      setMessage('');
      setIsSuccess(true);
      fetchTickets();

      // Clear success indicator after some time
      setTimeout(() => setIsSuccess(false), 5000);
    } catch (err: any) {
      logger.warn('DB submission failed, falling back to WhatsApp:', err);
      // Fallback: Send via WhatsApp
      const typeLabel = 
        issueType === 'bug' ? 'Bug Report' :
        issueType === 'feature' ? 'Custom Feature Request' :
        issueType === 'printer' ? 'Printer Issue' : 'Suggestion / Feedback';

      const formattedText = `*POS SUPPORT TICKET*\n-----------------------------\n*Name:* ${name}\n*Contact Info:* ${email || 'Not Provided'}\n*Subject:* ${subject}\n*Issue Type:* ${typeLabel}\n*Message:* \n"${message}"\n-----------------------------\nSent via Restaurant POS Support Form`;

      const whatsappUrl = `https://wa.me/918677994666?text=${encodeURIComponent(formattedText)}`;
      window.open(whatsappUrl, '_blank');
      showToast('Support ticket sent via WhatsApp!', 'success');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReplyToTicket = async (ticketId: string) => {
    if (!(newReplyText[ticketId] || '').trim() || !supabase) return;
    setIsReplying(true);
    try {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return;

      const newReply = {
        sender: 'user',
        senderName: name || 'Restaurant Owner',
        message: (newReplyText[ticketId] || '').trim(),
        timestamp: new Date().toISOString()
      };

      const updatedReplies = [...(ticket.replies || []), newReply];

      const { error } = await supabase
        .from('support_tickets')
        .update({
          replies: updatedReplies,
          status: 'open', // Re-open or mark as open for admin view
          updated_at: new Date().toISOString()
        })
        .eq('id', ticketId);

      if (error) throw error;

      showToast('Reply sent successfully!', 'success');
      setNewReplyText(prev => ({ ...prev, [ticketId]: '' }));
      fetchTickets();
    } catch (err: any) {
      console.error(err);
      showToast('Failed to send reply!', 'error');
    } finally {
      setIsReplying(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 transition-colors">
      {/* Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-orange-500 via-pink-500 to-indigo-600 rounded-3xl p-6 md:p-8 text-white shadow-lg shrink-0">
        <div className="absolute top-0 right-0 transform translate-x-12 -translate-y-12 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 transform -translate-x-12 translate-y-12 w-64 h-64 bg-black/10 rounded-full blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-black uppercase tracking-wider w-fit backdrop-blur-md mb-3">
              <Sparkles size={12} className="animate-spin" /> Technical Support Portal
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Guddu Kumar Kushwaha</h1>
            <p className="text-white/80 font-bold text-sm mt-1 max-w-xl">
              For any issues with the Restaurant POS or to request custom features, please contact the developer Guddu Kumar Kushwaha directly.
            </p>
          </div>
          <div className="hidden lg:flex bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl items-center gap-3">
            <ShieldCheck size={32} className="text-white" />
            <div>
              <div className="font-bold text-sm">Priority Support Active</div>
              <div className="text-xs text-white/70">Response within 2-4 Hours</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Contact Form & FAQ */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Support Ticket Form */}
          <div className="glass-card-solid rounded-3xl p-6 shadow-sm flex flex-col gap-5 transition-colors">
            <h2 className="text-lg font-black text-gray-800 dark:text-slate-100 flex items-center gap-2 transition-colors">
              <MessageSquare className="text-orange-500" size={20} />
              Open a Support Ticket
            </h2>
            
            {isSuccess ? (
              <div className="flex flex-col items-center justify-center py-8 text-center animate-in zoom-in-95 duration-200 bg-green-50/50 dark:bg-green-950/20 rounded-2xl border border-green-100 dark:border-green-900/40 transition-colors">
                <div className="w-16 h-16 bg-green-50 dark:bg-green-950/30 text-green-500 rounded-full flex items-center justify-center border-2 border-green-200 dark:border-green-800 shadow-md dark:shadow-none mb-4 transition-colors">
                  <CheckCircle2 size={36} className="animate-bounce" />
                </div>
                <h3 className="text-lg font-black text-green-800 dark:text-green-400 transition-colors">Support Ticket Logged!</h3>
                <p className="text-gray-500 dark:text-slate-400 text-xs font-bold mt-2 max-w-sm px-4">
                  Your ticket has been safely saved to the cloud database! The developer team will review it shortly and reply to you. You can check the ticket history and real-time status in the side-panel.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 transition-colors">Your Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rajesh Kumar"
                    className="input-premium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 transition-colors">Email or Phone (For Contact)</label>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. contact@example.com"
                    className="input-premium"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 transition-colors">Topic / Problem Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'bug', label: '🪲 Bug Report' },
                      { id: 'feature', label: '🚀 Custom Feature' },
                      { id: 'printer', label: '🖨️ Printer Issue' },
                      { id: 'other', label: '💡 Suggestions' }
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setIssueType(t.id)}
                        className={`p-2.5 rounded-xl font-bold text-xs text-center border-2 transition-all ${
                          issueType === t.id
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400 shadow-sm shadow-orange-100 dark:shadow-none'
                            : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 transition-colors">Ticket Subject *</label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. GST billing configuration issues or printer not showing"
                    className="input-premium"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 transition-colors">Message / Problem Description *</label>
                  <textarea
                    rows={4}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe your issue or desired feature in detail..."
                    className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-medium text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 placeholder-gray-400 dark:placeholder-slate-500 transition-colors"
                  ></textarea>
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-black rounded-xl shadow-md shadow-orange-100 dark:shadow-none flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
                  >
                    <Send size={16} />
                    {isSubmitting ? 'Logging Ticket...' : 'Submit Support Ticket'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Quick FAQ Section */}
          <div className="glass-card-solid rounded-3xl p-6 shadow-sm flex flex-col gap-4 transition-colors">
            <h2 className="text-lg font-black text-gray-800 dark:text-slate-100 flex items-center gap-2 transition-colors">
              <HelpCircle className="text-indigo-500" size={20} />
              Frequently Asked Questions (FAQ)
            </h2>
            <div className="flex flex-col gap-3">
              {faqs.map((faq, idx) => (
                <div key={idx} className="border border-gray-100 dark:border-slate-800/60 rounded-2xl overflow-hidden transition-all bg-gray-50/50 dark:bg-slate-900/30">
                  <button
                    onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                    className="w-full text-left p-4 font-bold text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100/50 dark:hover:bg-slate-800/50 flex justify-between items-center gap-2 transition-colors min-w-0"
                  >
                    <span className="flex-1 min-w-0">{faq.q}</span>
                    <span className="text-indigo-500 text-lg font-black shrink-0">{activeFaq === idx ? '−' : '+'}</span>
                  </button>
                  {activeFaq === idx && (
                    <div className="px-4 pb-4 text-xs font-semibold text-gray-500 dark:text-slate-400 leading-relaxed animate-in slide-in-from-top-2 duration-150">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          
        </div>

        {/* Right 1 Column: Direct Contact & Socials */}
        <div className="flex flex-col gap-6">
          
          {/* Live Support Tickets History */}
          <div className="glass-card-solid rounded-3xl p-6 shadow-sm flex flex-col gap-4 transition-colors">
            <h2 className="text-sm font-black text-gray-800 dark:text-slate-200 flex items-center gap-2 border-b border-gray-50 dark:border-slate-800/50 pb-3 transition-colors">
              <MessageCircle className="text-indigo-500 animate-pulse" size={16} />
              My Support Tickets ({tickets.length})
            </h2>

            {ticketsLoading ? (
              <p className="text-xs text-gray-400 dark:text-slate-500 font-bold text-center py-4">Loading active tickets...</p>
            ) : tickets.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-slate-500 font-semibold text-center py-4">No tickets logged yet. Submit a message on the left to start.</p>
            ) : (
              <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-1">
                {tickets.map((t) => {
                  const isExpanded = expandedTicketId === t.id;
                  const dateStr = new Date(t.created_at).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short'
                  });

                  return (
                    <div key={t.id} className="border border-gray-100 dark:border-slate-800/60 rounded-2xl overflow-hidden bg-gray-50/50 dark:bg-slate-900/30 flex flex-col transition-colors">
                      <div 
                        onClick={() => setExpandedTicketId(isExpanded ? null : t.id)}
                        className="p-3 cursor-pointer hover:bg-gray-100/50 dark:hover:bg-slate-800/50 flex justify-between items-start gap-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <span className="text-xs text-gray-400 dark:text-slate-500 font-bold flex items-center gap-1">
                            <Clock size={10} />
                            {dateStr}
                          </span>
                          <h4 className="font-bold text-xs text-gray-700 dark:text-slate-300 truncate mt-0.5 transition-colors">{t.subject}</h4>
                          <div className="flex items-center gap-1.5 mt-1">
                            {t.status === 'open' ? (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                            ) : t.status === 'in-progress' ? (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                            ) : (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500"></span>
                            )}
                            <span className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-slate-400">{t.status}</span>
                          </div>
                        </div>
                        <button className="text-gray-400 dark:text-slate-500 self-center shrink-0">
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="px-3 pb-3 border-t border-gray-100/50 dark:border-slate-800/50 pt-2 flex flex-col gap-3">
                          <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-gray-200/50 dark:border-slate-700 text-xs font-medium text-gray-600 dark:text-slate-400 leading-normal transition-colors">
                            <p className="font-bold text-gray-700 dark:text-slate-300 mb-0.5 transition-colors">My Description:</p>
                            "{t.description}"
                          </div>

                          {/* Replies Timeline */}
                          {t.replies && t.replies.length > 0 && (
                            <div className="flex flex-col gap-2 border-t border-gray-100 dark:border-slate-800/50 pt-2">
                              <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Conversation</p>
                              {t.replies.map((rep: any, rIdx: number) => {
                                const isDeveloper = rep.sender === 'admin';
                                return (
                                  <div 
                                    key={rIdx} 
                                    className={`flex flex-col p-2.5 rounded-xl text-xs leading-normal max-w-[85%] transition-colors ${
                                    isDeveloper 
                                      ? 'bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100/80 dark:border-indigo-900/40 text-indigo-800 dark:text-indigo-300 self-start' 
                                      : 'bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/40 text-orange-800 dark:text-orange-300 self-end'
                                  }`}
                                  >
                                    <span className="font-black block text-xs uppercase tracking-wider text-gray-400 mb-0.5">
                                      {isDeveloper ? '🛠️ Developer Guddu' : 'Me'}
                                    </span>
                                    <span>{rep.message}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Quick Reply Form */}
                          {t.status !== 'closed' && (
                            <div className="flex gap-1.5 border-t border-gray-100 dark:border-slate-800/50 pt-2">
                              <input 
                                type="text"
                                value={newReplyText[t.id] || ''}
                                onChange={(e) => setNewReplyText(prev => ({ ...prev, [t.id]: e.target.value }))}
                                placeholder="Type a reply..."
                                className="flex-1 py-2.5 px-3 min-h-[36px] border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500 font-bold text-sm text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 placeholder-gray-400 dark:placeholder-slate-500 transition-colors"
                              />
                              <button
                                onClick={() => handleReplyToTicket(t.id)}
                                disabled={isReplying || !(newReplyText[t.id] || '').trim()}
                                className="px-3 bg-indigo-600 text-white rounded-xl font-black text-xs hover:bg-indigo-700 disabled:opacity-50 cursor-pointer active:scale-95"
                              >
                                Send
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Contact Cards */}
          <div className="glass-card-solid rounded-3xl p-6 shadow-sm flex flex-col gap-5 transition-colors">
            <h2 className="text-lg font-black text-gray-800 dark:text-slate-100 flex items-center gap-2 transition-colors">
              <AlertCircle className="text-pink-500" size={20} />
              Direct Contacts
            </h2>
            
            <div className="flex flex-col gap-3">
              
              {/* WhatsApp Card */}
              <a
                href="https://wa.me/918677994666?text=Hi%20Guddu,%20I%20need%20support%20with%20POS%20System"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 p-4 border border-green-100 dark:border-green-900/40 hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50/40 dark:hover:bg-green-950/20 rounded-2xl transition-all shadow-sm shadow-green-50/20 dark:shadow-none"
              >
                <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400 flex items-center justify-center shadow-inner dark:shadow-none group-hover:scale-110 transition-transform">
                  <MessageSquare size={22} fill="currentColor" className="text-green-500 border-none" />
                </div>
                <div>
                  <div className="font-black text-sm text-gray-800 dark:text-slate-200 transition-colors">WhatsApp Support</div>
                  <div className="text-xs font-bold text-green-600 dark:text-green-400 mt-0.5">+91 86779 94666</div>
                </div>
              </a>

              {/* Email Card */}
              <a
                href="mailto:gudduk483@gmail.com?subject=Restaurant%20POS%20Support%20Request"
                className="group flex items-center gap-4 p-4 border border-blue-100 dark:border-blue-900/40 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 rounded-2xl transition-all shadow-sm shadow-blue-50/20 dark:shadow-none"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-inner dark:shadow-none group-hover:scale-110 transition-transform">
                  <Mail size={22} className="text-blue-500" />
                </div>
                <div>
                  <div className="font-black text-sm text-gray-800 dark:text-slate-200 transition-colors">Email Developer</div>
                  <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5">gudduk483@gmail.com</div>
                </div>
              </a>

              {/* Call Card */}
              <a
                href="tel:+918677994666"
                className="group flex items-center gap-4 p-4 border border-indigo-100 dark:border-indigo-900/40 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 rounded-2xl transition-all shadow-sm shadow-indigo-50/20 dark:shadow-none"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner dark:shadow-none group-hover:scale-110 transition-transform">
                  <Phone size={22} className="text-indigo-500" />
                </div>
                <div>
                  <div className="font-black text-sm text-gray-800 dark:text-slate-200 transition-colors">Guddu Kumar Kushwaha</div>
                  <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">Call: +91 86779 94666</div>
                </div>
              </a>

            </div>
          </div>

          {/* Development Status Card */}
          <div className="bg-gradient-to-br from-gray-900 to-indigo-950 text-white rounded-3xl p-6 shadow-lg flex flex-col gap-4">
            <h3 className="font-black text-base flex items-center gap-2">
              <Sparkles className="text-yellow-400 animate-pulse" size={18} />
              POS System Version
            </h3>
            <div className="flex flex-col gap-2.5 text-xs text-gray-300 font-medium">
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span>Release Status</span>
                <span className="text-green-400 font-bold">Stable (Production)</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span>Current Core Version</span>
                <span className="font-bold">V{import.meta.env.VITE_APP_VERSION}</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span>IndexedDB Sync</span>
                <span className="text-blue-400 font-bold">Local Sync Connected</span>
              </div>
              <div className="flex justify-between">
                <span>Cloud Server Status</span>
                <span className="text-green-400 font-bold">Connected (Realtime)</span>
              </div>
            </div>
            
            <div className="mt-2 text-xs text-gray-400 bg-white/5 p-3 rounded-xl border border-white/5 leading-relaxed font-semibold">
               For any custom printer integration, custom billing receipts, or local networking configurations in the POS System, please use WhatsApp support.
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
