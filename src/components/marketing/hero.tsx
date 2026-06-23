"use client";

import { motion } from "framer-motion";
import { Download, PlayCircle, Wifi, ShieldCheck, BadgeIndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { stats, DOWNLOAD_URL } from "./site-data";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-warm-grain pt-28 pb-16 sm:pt-32 lg:pt-36">
      {/* decorative blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-amber-300/30 blur-3xl" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-orange-300/25 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-rose-200/30 blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <motion.a
            href="#pricing"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-amber-700 shadow-sm backdrop-blur hover:bg-white"
          >
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
            Plans from ₹99/month · No lock-in
            <span className="text-amber-400">→</span>
          </motion.a>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="mt-6 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-stone-900 sm:text-6xl lg:text-7xl"
          >
            Restaurant billing,
            <br className="hidden sm:block" />{" "}
            <span className="text-gradient-amber">made beautifully simple</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12 }}
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-stone-600 sm:text-xl"
          >
            Siya Bill is the all-in-one offline POS &amp; billing software for Indian
            restaurants, dhabas, cafés &amp; cloud kitchens. GST billing, UPI QR,
            Khata (Udhar), Kitchen Display, inventory &amp; reports — on your PC.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18 }}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button
              asChild
              size="lg"
              className="h-12 w-full bg-gradient-to-r from-amber-500 to-orange-600 px-7 text-base text-white shadow-warm-lg hover:from-amber-600 hover:to-orange-700 sm:w-auto"
            >
              <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-5 w-5" />
                Download for Windows
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 w-full border-stone-300 bg-white/70 px-7 text-base text-stone-800 backdrop-blur hover:bg-white sm:w-auto"
            >
              <a href="#showcase">
                <PlayCircle className="mr-2 h-5 w-5 text-amber-600" />
                See it in action
              </a>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.55, delay: 0.26 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-stone-500"
          >
            <span className="inline-flex items-center gap-1.5">
              <Wifi className="h-4 w-4 text-amber-600" /> Works offline
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-amber-600" /> Full premium access
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BadgeIndianRupee className="h-4 w-4 text-amber-600" /> Plans from ₹99/mo
            </span>
          </motion.div>
        </div>

        {/* Hero app preview */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto mt-14 max-w-6xl"
        >
          <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-amber-200/40 via-orange-200/30 to-rose-200/30 blur-2xl" />

          {/* floating accent cards */}
          <motion.div
            initial={{ opacity: 0, x: -20, y: 10 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="absolute -left-3 top-16 z-20 hidden animate-floaty rounded-2xl border border-stone-200 bg-white p-3 shadow-warm-lg sm:block lg:-left-10"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 text-green-700">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-900">Bill #000002</p>
                <p className="text-[11px] text-stone-500">UPI · ₹415.00</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20, y: 10 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.6, delay: 0.75 }}
            className="absolute -right-3 bottom-16 z-20 hidden animate-floaty rounded-2xl border border-stone-200 bg-white p-3 shadow-warm-lg [animation-delay:1.5s] sm:block lg:-right-10"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-900">Today&apos;s Sales</p>
                <p className="text-[11px] text-stone-500">₹14,820 · +18%</p>
              </div>
            </div>
          </motion.div>

          {/* App frame */}
          <div className="app-frame relative">
            <div className="flex items-center gap-2 border-b border-white/10 bg-stone-800 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-red-400" />
              <span className="h-3 w-3 rounded-full bg-amber-400" />
              <span className="h-3 w-3 rounded-full bg-green-400" />
              <p className="ml-3 truncate text-xs font-medium text-stone-400">
                Siya Bill — Restaurant POS · Dashboard
              </p>
            </div>
            <img
              src="/screenshots/dashboard.png"
              alt="Siya Bill dashboard showing today's sales and recent bills"
              className="block w-full"
              loading="eager"
            />
          </div>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mx-auto mt-14 grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-stone-200 bg-stone-200 shadow-warm sm:grid-cols-4"
        >
          {stats.map((s) => (
            <div key={s.label} className="bg-white px-6 py-6 text-center">
              <p className="font-display text-3xl font-extrabold text-stone-900 sm:text-4xl">
                {s.value}
              </p>
              <p className="mt-1 text-sm text-stone-500">{s.label}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
