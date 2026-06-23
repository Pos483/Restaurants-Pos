"use client";

import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { steps, plans } from "./site-data";
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
            Pay once. Use it forever.
          </h2>
          <p className="mt-4 text-lg text-stone-600">
            No monthly cloud fees. No per-bill charges. No surprises. Start free for
            14 days, then pick the plan that fits.
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
                <a href="#download">{plan.cta}</a>
              </Button>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-stone-500">
          Prices in INR, inclusive of all taxes. Premium license is valid for one PC.
        </p>
      </div>
    </section>
  );
}
