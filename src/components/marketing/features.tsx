"use client";

import { motion } from "framer-motion";
import { features } from "./site-data";

export function TrustMarquee() {
  const items = [
    "Cash",
    "UPI",
    "Card",
    "Split Payment",
    "Credit (Udhar)",
    "GST Billing",
    "FSSAI",
    "UPI QR",
    "KOT Print",
    "Thermal Printer",
    "WhatsApp",
    "Excel Import",
    "Dark Mode",
    "Offline",
  ];
  return (
    <section className="border-y border-stone-200 bg-white py-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest text-stone-400">
          Built for the way Indian restaurants actually run
        </p>
        <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
          <div className="flex w-max animate-marquee items-center gap-3">
            {[...items, ...items].map((item, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-stone-200 bg-stone-50 px-4 py-1.5 text-sm font-medium text-stone-600"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 bg-warm-grain py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-600">
            Everything you need
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-stone-900 sm:text-5xl">
            One software for your whole restaurant
          </h2>
          <p className="mt-4 text-lg text-stone-600">
            From the counter to the kitchen to the books — Siya Bill handles billing,
            orders, inventory, credit and reports so you can focus on the food.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: (i % 3) * 0.08 }}
              className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-warm transition-all hover:-translate-y-1 hover:shadow-warm-lg"
            >
              <div
                className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${f.accent} text-white shadow-sm`}
              >
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-display text-lg font-bold text-stone-900">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{f.desc}</p>
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-100/0 transition-colors duration-300 group-hover:bg-amber-100/60" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
