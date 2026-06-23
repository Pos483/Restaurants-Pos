"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { galleryShots } from "./site-data";
import { cn } from "@/lib/utils";

export function Gallery() {
  const [active, setActive] = useState<number | null>(null);

  const close = () => setActive(null);
  const prev = () =>
    setActive((i) => (i === null ? i : (i - 1 + galleryShots.length) % galleryShots.length));
  const next = () =>
    setActive((i) => (i === null ? i : (i + 1) % galleryShots.length));

  return (
    <section
      id="screenshots"
      className="scroll-mt-20 bg-stone-950 py-20 text-white sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">
            Take the tour
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
            Every screen, crafted with care
          </h2>
          <p className="mt-4 text-lg text-stone-400">
            Click any screenshot to explore the full interface — dashboard, kitchen,
            reports, menu, customers and more.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
          {galleryShots.map((shot, i) => (
            <motion.button
              key={shot.src}
              type="button"
              onClick={() => setActive(i)}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: (i % 3) * 0.06 }}
              className={cn(
                "group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 text-left transition-all hover:border-amber-400/40 hover:bg-white/10",
                i === 0 && "col-span-2 sm:col-span-1",
              )}
            >
              <img
                src={shot.src}
                alt={shot.title}
                className="aspect-[16/10] w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-stone-950/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3">
                <p className="text-sm font-bold text-white">{shot.title}</p>
                <p className="text-[11px] text-stone-300">{shot.caption}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {active !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/90 p-4 backdrop-blur-sm"
            onClick={close}
          >
            <button
              type="button"
              onClick={close}
              className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              className="absolute left-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-6"
              aria-label="Previous"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              className="absolute right-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-6"
              aria-label="Next"
            >
              <ChevronRight className="h-6 w-6" />
            </button>

            <motion.figure
              key={active}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25 }}
              className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-xl bg-stone-900 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={galleryShots[active].src}
                alt={galleryShots[active].title}
                className="max-h-[80vh] w-full object-contain"
              />
              <figcaption className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-semibold text-white">
                  {galleryShots[active].title}
                </span>
                <span className="text-stone-400">{galleryShots[active].caption}</span>
              </figcaption>
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
