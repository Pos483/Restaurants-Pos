"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Download, CheckCircle2, Loader2, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export function DownloadCta() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "download-cta" }),
      });
      if (!res.ok) throw new Error("Request failed");
      setDone(true);
      toast({
        title: "You're on the list!",
        description: "Your free trial download is starting.",
      });
    } catch {
      toast({
        title: "Something went wrong",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="download" className="scroll-mt-20 bg-stone-950 py-20 text-white sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-stone-900 via-stone-900 to-amber-950/40 px-6 py-12 sm:px-12 sm:py-16"
        >
          {/* glow */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-orange-500/15 blur-3xl" />

          <div className="relative grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">
                Start free today
              </p>
              <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
                Get Siya Bill on your PC
              </h2>
              <p className="mt-4 max-w-md text-lg text-stone-300">
                Download the 14-day free trial — every feature unlocked. No credit card,
                no cloud signup. Love it? Pay once for a lifetime license.
              </p>

              <ul className="mt-6 space-y-2.5">
                {[
                  "Full-feature 14-day free trial",
                  "Windows 7, 10 & 11 supported",
                  "Lifetime license — no monthly fees",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2.5 text-sm text-stone-200">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-amber-400" />
                    {t}
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="h-12 bg-gradient-to-r from-amber-500 to-orange-600 px-7 text-base text-white shadow-warm-lg hover:from-amber-600 hover:to-orange-700"
                >
                  <a href="#download">
                    <Download className="mr-2 h-5 w-5" />
                    Download for Windows
                  </a>
                </Button>
                <span className="inline-flex items-center gap-2 self-center text-xs text-stone-400">
                  <Zap className="h-4 w-4 text-amber-400" /> ~45 MB · v2.3.2
                </span>
              </div>
            </div>

            {/* Lead card */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur sm:p-7">
              {done ? (
                <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
                    <CheckCircle2 className="h-8 w-8" />
                  </span>
                  <h3 className="mt-4 font-display text-xl font-bold">Thank you!</h3>
                  <p className="mt-1 text-sm text-stone-300">
                    Your download link has been sent to your inbox. Check your email for
                    the Siya Bill installer.
                  </p>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                  <div>
                    <h3 className="font-display text-xl font-bold">
                      Get the download link
                    </h3>
                    <p className="mt-1 text-sm text-stone-400">
                      Drop your email and we&apos;ll send the installer plus a quick-start
                      guide.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="cta-email" className="sr-only">
                      Email address
                    </label>
                    <input
                      id="cta-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@restaurant.com"
                      className="h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-sm text-white placeholder:text-stone-500 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="h-12 w-full bg-gradient-to-r from-amber-500 to-orange-600 text-base text-white shadow-warm hover:from-amber-600 hover:to-orange-700"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-5 w-5" />
                        Send me the download
                      </>
                    )}
                  </Button>
                  <p className="flex items-center justify-center gap-1.5 text-xs text-stone-500">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    No spam. Unsubscribe anytime.
                  </p>
                </form>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
