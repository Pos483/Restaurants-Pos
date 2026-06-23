"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { showcases } from "./site-data";
import { cn } from "@/lib/utils";

export function Showcase() {
  return (
    <section id="showcase" className="scroll-mt-20 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-600">
            See it in action
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-stone-900 sm:text-5xl">
            Designed for real restaurant workflows
          </h2>
          <p className="mt-4 text-lg text-stone-600">
            Every screen is built for speed on a busy service day. No clutter, no
            cloud logins — just open and bill.
          </p>
        </div>

        <div className="mt-16 space-y-20 sm:space-y-28">
          {showcases.map((s, idx) => (
            <div key={s.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
              {/* Image */}
              <motion.div
                initial={{ opacity: 0, x: s.reverse ? 40 : -40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className={cn("relative", s.reverse ? "lg:order-2" : "lg:order-1")}
              >
                <div className="absolute -inset-3 -z-10 rounded-[1.75rem] bg-gradient-to-tr from-amber-200/40 to-orange-200/30 blur-2xl" />
                <div className="app-frame">
                  <div className="flex items-center gap-2 border-b border-white/10 bg-stone-800 px-4 py-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                  </div>
                  <img
                    src={s.image}
                    alt={s.title}
                    className="block w-full"
                    loading="lazy"
                  />
                </div>
              </motion.div>

              {/* Text */}
              <motion.div
                initial={{ opacity: 0, x: s.reverse ? -40 : 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className={cn(s.reverse ? "lg:order-1" : "lg:order-2")}
              >
                <p className="text-sm font-semibold uppercase tracking-widest text-amber-600">
                  {s.eyebrow}
                </p>
                <h3 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">
                  {s.title}
                </h3>
                <p className="mt-4 text-base leading-relaxed text-stone-600 sm:text-lg">
                  {s.desc}
                </p>
                <ul className="mt-6 space-y-3">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                      <span className="text-sm text-stone-700 sm:text-base">{b}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
