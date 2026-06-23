"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Download, CheckCircle2, Loader2, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { DOWNLOAD_URL } from "./site-data";

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
        description: "Your Siya Bill download is ready.",
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
                Get started today
              </p>
              <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
                Get Siya Bill on your PC
              </h2>
              <p className="mt-4 max-w-md text-lg text-stone-300">
                Download the full Siya Bill software for your Windows PC. Install in
                minutes, pick a plan from ₹99/month, and start billing. No cloud signup,
                no per-bill charges.
              </p>

              <ul className="mt-6 space-y-2.5">
                {[
                  "Full premium POS software",
                  "Windows 7, 10 & 11 supported",
                  "Plans from ₹99/month — no lock-in",
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
                  <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-2 h-5 w-5" />
                    Download for Windows
                  </a>
                </Button>
                <span className="inline-flex items-center gap-2 self-center text-xs text-stone-400">
                  <Zap className="h-4 w-4 text-amber-400" /> ~45 MB · v2.3.2
                </span>
              </div>

              <a
                href="https://wa.me/918677994666?text=Hi%20Siya%20Bill%2C%20I%20want%20to%20buy%20a%20premium%20plan"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-green-400 transition-colors hover:text-green-300"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Need help buying? WhatsApp us: +91 86779 94666
              </a>
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
                    Your download link has been sent to your inbox. You can also grab the
                    installer directly below.
                  </p>
                  <Button
                    asChild
                    className="mt-5 h-12 bg-gradient-to-r from-amber-500 to-orange-600 px-6 text-base text-white shadow-warm hover:from-amber-600 hover:to-orange-700"
                  >
                    <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                      <Download className="mr-2 h-5 w-5" />
                      Download installer now
                    </a>
                  </Button>
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
