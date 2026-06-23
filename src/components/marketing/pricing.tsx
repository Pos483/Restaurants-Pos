"use client";

import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { steps, plans, DOWNLOAD_URL } from "./site-data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HowItWorks() {
  return (
    <section className="bg-warm-grain py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-600">
            Up and running today
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-stone-900 sm:text-5xl">
            From install to first bill in minutes
          </h2>
          <p className="mt-4 text-lg text-stone-600">
            No cloud setup, no training marathon. Download, add your menu, connect a
            printer and you&apos;re billing.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.step}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.45, delay: i * 0.1 }}
              className="relative rounded-2xl border border-stone-200 bg-white p-6 shadow-warm"
            >
              <span className="font-display text-5xl font-extrabold text-amber-200">
                {s.step}
              </span>
              <h3 className="mt-2 font-display text-lg font-bold text-stone-900">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{s.desc}</p>
              {i < steps.length - 1 && (
                <span className="absolute -right-3 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center text-amber-400 lg:flex">
                  →
                </span>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-600">
            Simple, honest pricing
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-stone-900 sm:text-5xl">
            Pick a plan that fits your kitchen
          </h2>
          <p className="mt-4 text-lg text-stone-600">
            Start with Monthly or save more with Half-Yearly and Yearly. Full premium
            POS access on every plan — no per-bill charges, no lock-in.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative flex flex-col rounded-3xl border p-7 transition-all",
                plan.highlighted
                  ? "border-amber-300 bg-gradient-to-b from-amber-50 to-white shadow-warm-lg lg:-mt-4 lg:mb-4"
                  : "border-stone-200 bg-white shadow-warm",
              )}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-3 py-1 text-xs font-bold text-white shadow-warm">
                  <Sparkles className="h-3.5 w-3.5" />
                  {plan.badge}
                </span>
              )}
              <h3 className="font-display text-lg font-bold text-stone-900">
                {plan.name}
              </h3>
              <p className="mt-1 text-sm text-stone-500">{plan.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="font-display text-4xl font-extrabold text-stone-900">
                  {plan.price}
                </span>
                <span className="text-sm font-medium text-stone-500">
                  / {plan.period}
                </span>
              </div>

              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    <span className="text-sm text-stone-700">{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                className={cn(
                  "mt-7 h-12 w-full text-base",
                  plan.highlighted
                    ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-warm hover:from-amber-600 hover:to-orange-700"
                    : "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
                )}
                variant={plan.highlighted ? "default" : "outline"}
              >
                <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">{plan.cta}</a>
              </Button>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-stone-500">
          Prices in INR, inclusive of all taxes. Each plan covers 1 store on 1 PC. Download the app and activate your plan inside, or message us on WhatsApp.
        </p>

        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <a
            href="https://wa.me/918677994666?text=Hi%20Siya%20Bill%2C%20I%20want%20to%20buy%20a%20premium%20plan"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-green-500 px-5 py-2.5 text-sm font-semibold text-white shadow-warm transition-colors hover:bg-green-600"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Buy on WhatsApp · +91 86779 94666
          </a>
          <a
            href="tel:+918677994666"
            className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
          >
            Call to buy
          </a>
        </div>
      </div>
    </section>
  );
}
