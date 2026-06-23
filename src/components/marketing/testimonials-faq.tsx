"use client";

import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";
import { testimonials, faqs } from "./site-data";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function Testimonials() {
  return (
    <section className="bg-warm-grain py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="flex items-center justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
            ))}
          </div>
          <p className="mt-3 text-sm font-semibold uppercase tracking-widest text-amber-600">
            Loved by restaurateurs
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-stone-900 sm:text-5xl">
            Trusted at counters across India
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.figure
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.45, delay: i * 0.1 }}
              className="relative flex flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-warm"
            >
              <Quote className="h-8 w-8 text-amber-200" />
              <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed text-stone-700">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t border-stone-100 pt-4">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-sm font-bold text-white">
                  {t.initials}
                </span>
                <div>
                  <p className="text-sm font-bold text-stone-900">{t.name}</p>
                  <p className="text-xs text-stone-500">{t.role}</p>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-600">
            Questions?
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-stone-900 sm:text-5xl">
            Frequently asked questions
          </h2>
          <p className="mt-4 text-lg text-stone-600">
            Everything you need to know about Siya Bill. Can&apos;t find an answer?{" "}
            <a href="#download" className="font-semibold text-amber-600 underline-offset-4 hover:underline">
              Talk to us
            </a>
            .
          </p>
        </div>

        <Accordion type="single" collapsible className="mt-10 space-y-3">
          {faqs.map((item, i) => (
            <div
              key={item.q}
              className="overflow-hidden rounded-xl border border-stone-200 bg-white px-5 shadow-sm"
            >
              <AccordionItem value={`item-${i}`} className="border-0">
                <AccordionTrigger className="py-5 text-left text-base font-semibold text-stone-900 hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-[15px] leading-relaxed text-stone-600">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            </div>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
