import { LogoMark } from "./logo";
import { DOWNLOAD_URL } from "./site-data";
import { Mail, Phone, MapPin, MessageCircle } from "lucide-react";

const footerNav = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Showcase", href: "#showcase" },
      { label: "Screenshots", href: "#screenshots" },
      { label: "Pricing", href: "#pricing" },
      { label: "Download", href: "#download" },
    ],
  },
  {
    title: "Use cases",
    links: [
      { label: "Restaurants", href: "#features" },
      { label: "Dhabas", href: "#features" },
      { label: "Cafés & Bakeries", href: "#features" },
      { label: "Cloud Kitchens", href: "#features" },
      { label: "Sweet Shops", href: "#features" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "FAQ", href: "#faq" },
      { label: "Contact Sales", href: "#download" },
      { label: "Printer Setup", href: "#faq" },
      { label: "WhatsApp Help", href: "#download" },
      { label: "Buy Premium", href: "#pricing" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-stone-200 bg-stone-50">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-5">
          {/* Brand + contact */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <LogoMark />
              <span className="font-display text-xl font-extrabold tracking-tight text-stone-900">
                Siya<span className="text-amber-600">Bill</span>
              </span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-stone-600">
              The offline Restaurant POS &amp; billing software built for Indian
              restaurants, dhabas, cafés and cloud kitchens. Bill faster, track smarter,
              with plans from ₹99/month.
            </p>

            <div className="mt-5 space-y-2 text-sm">
              <a
                href="mailto:hello@siyabill.app"
                className="flex items-center gap-2.5 text-stone-600 transition-colors hover:text-amber-600"
              >
                <Mail className="h-4 w-4 text-amber-600" />
                hello@siyabill.app
              </a>
              <a
                href="tel:+918677994666"
                className="flex items-center gap-2.5 text-stone-600 transition-colors hover:text-amber-600"
              >
                <Phone className="h-4 w-4 text-amber-600" />
                +91 86779 94666
              </a>
              <a
                href="https://wa.me/918677994666"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 text-stone-600 transition-colors hover:text-amber-600"
              >
                <MessageCircle className="h-4 w-4 text-amber-600" />
                WhatsApp: +91 86779 94666
              </a>
              <p className="flex items-center gap-2.5 text-stone-600">
                <MapPin className="h-4 w-4 text-amber-600" />
                Made in India 🇮🇳
              </p>
            </div>
          </div>

          {/* Nav columns */}
          {footerNav.map((col) => (
            <div key={col.title}>
              <h4 className="font-display text-sm font-bold uppercase tracking-wider text-stone-900">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-stone-600 transition-colors hover:text-amber-600"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-stone-200 pt-6 sm:flex-row">
          <p className="text-sm text-stone-500">
            © {new Date().getFullYear()} Siya Bill. All rights reserved.
          </p>
          <div className="flex items-center gap-5 text-sm text-stone-500">
            <a href="#top" className="transition-colors hover:text-amber-600">
              Privacy
            </a>
            <a href="#top" className="transition-colors hover:text-amber-600">
              Terms
            </a>
            <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-amber-600">
              Download
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
