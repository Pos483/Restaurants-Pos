import {
  LayoutGrid,
  Zap,
  ChefHat,
  BarChart3,
  BookOpenText,
  Users,
  Boxes,
  Printer,
  Receipt,
  Moon,
  Wifi,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type Feature = {
  icon: LucideIcon;
  title: string;
  desc: string;
  accent: string;
};

export const features: Feature[] = [
  {
    icon: LayoutGrid,
    title: "Dine-In Table Billing",
    desc: "Manage 20+ tables visually. Tap a table, take orders by category, fire a KOT to the kitchen and settle with one click.",
    accent: "from-amber-500 to-orange-600",
  },
  {
    icon: Zap,
    title: "Quick Counter Billing",
    desc: "Lightning-fast takeaway & parcel billing. Add items, pick payment, print — a bill in under 10 seconds.",
    accent: "from-orange-500 to-red-500",
  },
  {
    icon: ChefHat,
    title: "Kitchen Display System",
    desc: "Digital KDS with active & completed order tickets. Keep your kitchen organised and orders moving.",
    accent: "from-rose-500 to-orange-500",
  },
  {
    icon: BarChart3,
    title: "Reports & Analytics",
    desc: "GST, P&L, daily, hourly, item-wise & closing reports. Export to PDF or CSV with one tap.",
    accent: "from-amber-600 to-yellow-500",
  },
  {
    icon: BookOpenText,
    title: "Khata (Udhar) Ledger",
    desc: "Track customer credit and outstanding balances. Never lose track of who owes what — the digital bahi-khata.",
    accent: "from-orange-600 to-amber-500",
  },
  {
    icon: Users,
    title: "Customer CRM",
    desc: "Tag customers VIP, Regular or Wholesale. Send WhatsApp broadcasts and see spend & visit history.",
    accent: "from-red-500 to-orange-500",
  },
  {
    icon: Boxes,
    title: "Stock & Inventory",
    desc: "Track raw material stock, daily usage and purchases. Get low-stock alerts before you run out.",
    accent: "from-amber-500 to-orange-600",
  },
  {
    icon: Printer,
    title: "Thermal Printer Ready",
    desc: "Plug-and-play thermal & ESC/POS printer support. Auto-print KOTs, bills and duplicate receipts.",
    accent: "from-orange-500 to-red-500",
  },
  {
    icon: Receipt,
    title: "GST + UPI QR Bills",
    desc: "Print GSTIN, FSSAI, store address & a dynamic UPI payment QR on every receipt. Get paid instantly.",
    accent: "from-yellow-500 to-amber-600",
  },
  {
    icon: Moon,
    title: "Dark Mode",
    desc: "A beautiful dark theme for long closing shifts. Easy on the eyes during late-night service.",
    accent: "from-zinc-600 to-amber-600",
  },
  {
    icon: Wifi,
    title: "Works 100% Offline",
    desc: "No internet? No problem. Siya Bill runs entirely on your PC. Your data stays with you, always.",
    accent: "from-amber-500 to-orange-600",
  },
  {
    icon: ShieldCheck,
    title: "One-Time Pricing",
    desc: "Pay once, use forever. No monthly cloud fees, no per-bill charges, no surprises.",
    accent: "from-orange-600 to-amber-500",
  },
];

export type Showcase = {
  eyebrow: string;
  title: string;
  desc: string;
  bullets: string[];
  image: string;
  reverse?: boolean;
  theme?: "light" | "dark";
};

export const showcases: Showcase[] = [
  {
    eyebrow: "Dine-In & Quick Billing",
    title: "Take orders and print bills in seconds",
    desc: "From a 20-table dine-in service to a packed takeaway counter, Siya Bill keeps billing fast and mistake-free. Tap items by category, apply discounts, fire a KOT and settle with Cash, UPI, Card or Udhar.",
    bullets: [
      "Visual table grid with live status",
      "Half / Full pricing & custom items",
      "Discounts, split payments & KOT printing",
      "Cash, UPI, Card, Credit (Udhar) & Unpaid",
    ],
    image: "/screenshots/table-order.png",
    theme: "light",
  },
  {
    eyebrow: "Reports & GST",
    title: "Know your numbers — GST to P&L",
    desc: "Every bill you print feeds live dashboards. See revenue breakdown, payment splits, hourly trends and item-wise performance. Export GST returns, P&L and closing reports to PDF or CSV in one click.",
    bullets: [
      "GST, P&L & closing reports",
      "Daily, hourly, item & bill analysis",
      "Revenue & payment-split charts",
      "One-click PDF / CSV export",
    ],
    image: "/screenshots/reports.png",
    reverse: true,
    theme: "light",
  },
  {
    eyebrow: "Khata & Customers",
    title: "The digital bahi-khata for Udhar",
    desc: "Track outstanding credit per customer, send WhatsApp reminders and broadcast offers. Tag customers as VIP, Regular or Wholesale and reward your loyal regulars.",
    bullets: [
      "Live total outstanding dashboard",
      "WhatsApp broadcast & reminders",
      "Customer tags & visit history",
      "Spend & frequency insights",
    ],
    image: "/screenshots/khata.png",
    theme: "light",
  },
  {
    eyebrow: "Stock & Menu",
    title: "Run a tight kitchen — stock to menu",
    desc: "Manage your full menu with categories, half/full rates and Excel/CSV bulk import. Track raw-material inventory, daily usage and purchases with low-stock alerts so you never run out mid-service.",
    bullets: [
      "Menu categories with half / full pricing",
      "Bulk import menu via Excel / CSV",
      "Inventory, daily use & purchases",
      "Low-stock alerts & Excel/PDF export",
    ],
    image: "/screenshots/stock.png",
    reverse: true,
    theme: "light",
  },
];

export const paymentMethods = [
  "Cash",
  "UPI",
  "Card",
  "Split",
  "Credit (Udhar)",
  "Unpaid",
];

export type GalleryShot = {
  src: string;
  title: string;
  caption: string;
};

export const galleryShots: GalleryShot[] = [
  { src: "/screenshots/dashboard.png", title: "Dashboard", caption: "Live sales & recent bills" },
  { src: "/screenshots/dashboard-dark.png", title: "Dark Mode", caption: "Easy on the eyes at night" },
  { src: "/screenshots/dine-in.png", title: "Dine-In", caption: "Visual table management" },
  { src: "/screenshots/quick-billing.png", title: "Quick Billing", caption: "Takeaway & parcel in seconds" },
  { src: "/screenshots/kitchen.png", title: "Kitchen Display", caption: "Active & completed orders" },
  { src: "/screenshots/menu.png", title: "Menu Manager", caption: "Categories & bulk import" },
  { src: "/screenshots/customers.png", title: "Customers", caption: "CRM with WhatsApp" },
  { src: "/screenshots/settings.png", title: "Settings", caption: "Printer, GST & WhatsApp bot" },
  { src: "/screenshots/bill-receipt.png", title: "Printed Bill", caption: "GST + UPI QR receipt" },
];

export const steps = [
  {
    step: "01",
    title: "Download & install",
    desc: "Get Siya Bill on your Windows PC. Install in minutes — no internet or cloud setup required.",
  },
  {
    step: "02",
    title: "Set your menu & rates",
    desc: "Add categories, items and half/full prices. Or bulk-import your menu from Excel/CSV.",
  },
  {
    step: "03",
    title: "Connect your printer",
    desc: "Plug in your thermal printer, add your GSTIN & UPI ID, and you're ready to print bills.",
  },
  {
    step: "04",
    title: "Start billing",
    desc: "Take orders, settle payments and watch live reports roll in. That's it — you're live.",
  },
];

export type Plan = {
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  badge?: string;
};

export const plans: Plan[] = [
  {
    name: "Free Trial",
    price: "₹0",
    period: "14 days",
    tagline: "Try every feature, no card needed.",
    features: [
      "Full feature access for 14 days",
      "Dine-In, Quick & Kitchen billing",
      "GST, P&L & inventory reports",
      "Khata & customer CRM",
      "Thermal printer support",
      "No credit card required",
    ],
    cta: "Download Free Trial",
  },
  {
    name: "Premium",
    price: "₹4,999",
    period: "one-time",
    tagline: "Pay once, use forever. No monthly fees.",
    features: [
      "Everything in Free Trial",
      "Lifetime license — 1 PC",
      "Unlimited bills & customers",
      "WhatsApp broadcast & reminders",
      "GST + UPI QR on every bill",
      "Priority support & free updates",
    ],
    cta: "Buy Premium",
    highlighted: true,
    badge: "Best Value",
  },
  {
    name: "Multi-Outlet",
    price: "Custom",
    period: "talk to us",
    tagline: "For chains & multiple outlets.",
    features: [
      "Everything in Premium",
      "Licenses for multiple PCs",
      "Multi-outlet setup",
      "Onboarding & training",
      "Dedicated account manager",
      "Bulk pricing",
    ],
    cta: "Contact Sales",
  },
];

export const stats = [
  { value: "500+", label: "Restaurants served" },
  { value: "12L+", label: "Bills generated" },
  { value: "99.9%", label: "Uptime, offline-first" },
  { value: "₹0", label: "Monthly cloud fees" },
];

export const testimonials = [
  {
    quote:
      "Siya Bill ne hamare counter ki speed double kar di. Quick billing itna fast hai ki rush mein bhi line nahi lagti.",
    name: "Rajesh Sharma",
    role: "Owner, Sharma Dhaba, Jaipur",
    initials: "RS",
  },
  {
    quote:
      "Khata feature is gold. Ab Udhar ka hisaab digital hai, aur WhatsApp pe reminder bhej dete hain. Recovery badh gayi.",
    name: "Priya Nair",
    role: "Manager, Spice Route Café, Kochi",
    initials: "PN",
  },
  {
    quote:
      "GST aur P&L reports ek click mein. CA ko direct CSV bhej deti hu. Closing ab 5 minute ka kaam hai.",
    name: "Amit Patel",
    role: "Owner, Food Junction, Surat",
    initials: "AP",
  },
];

export const faqs = [
  {
    q: "Does Siya Bill need an internet connection?",
    a: "No. Siya Bill is an offline desktop application that runs entirely on your PC. You can bill, print and generate reports without any internet. Your data stays with you, on your machine.",
  },
  {
    q: "Which printers does it support?",
    a: "Siya Bill supports most thermal (ESC/POS) and standard USB printers used in restaurants. Just plug it in, connect from the Settings → Printer Setup section, and you're ready to print KOTs and bills.",
  },
  {
    q: "Can I print GST and UPI QR on my bills?",
    a: "Yes. You can add your GSTIN, FSSAI code, store address, contact and a dynamic UPI payment QR code on every receipt. All of these are toggleable from Settings.",
  },
  {
    q: "Is there a monthly subscription fee?",
    a: "No. Siya Bill Premium is a one-time payment — pay once and use it forever on your PC. There are no monthly cloud fees and no per-bill charges.",
  },
  {
    q: "Can I import my existing menu?",
    a: "Absolutely. You can bulk-import your entire menu with categories, prices and half/full rates directly from an Excel or CSV file. No need to enter items one by one.",
  },
  {
    q: "What happens after the 14-day free trial?",
    a: "After 14 days you can purchase a Premium lifetime license to keep all features. Your data is never deleted — everything you've created during the trial stays intact.",
  },
  {
    q: "Which operating systems are supported?",
    a: "Siya Bill is currently available for Windows (7, 10 and 11). It runs as a desktop application — no browser or cloud login required.",
  },
  {
    q: "Do you offer support and training?",
    a: "Yes. Premium and Multi-Outlet plans include priority support and free software updates. We also help with onboarding and printer setup.",
  },
];
