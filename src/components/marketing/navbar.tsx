"use client";

import { useEffect, useState } from "react";
import { Menu, X, Download } from "lucide-react";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Showcase", href: "#showcase" },
  { label: "Screenshots", href: "#screenshots" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-stone-200/70 bg-white/85 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#top" className="shrink-0" aria-label="Siya Bill home">
          <Logo />
        </a>

        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-amber-50 hover:text-stone-900"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Button
            asChild
            variant="ghost"
            className="text-stone-700 hover:bg-amber-50 hover:text-stone-900"
          >
            <a href="#pricing">Buy Premium</a>
          </Button>
          <Button
            asChild
            className="bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-warm hover:from-amber-600 hover:to-orange-700"
          >
            <a href="#download">
              <Download className="mr-1.5 h-4 w-4" />
              Download
            </a>
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-stone-700 hover:bg-amber-50 md:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      <div
        className={cn(
          "md:hidden overflow-hidden border-t border-stone-200/70 bg-white/95 backdrop-blur-xl transition-[max-height] duration-300 ease-in-out",
          open ? "max-h-[26rem]" : "max-h-0",
        )}
      >
        <div className="space-y-1 px-4 py-4">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-base font-medium text-stone-700 hover:bg-amber-50"
            >
              {link.label}
            </a>
          ))}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button asChild variant="outline" className="border-stone-300">
              <a href="#pricing" onClick={() => setOpen(false)}>
                Buy Premium
              </a>
            </Button>
            <Button
              asChild
              className="bg-gradient-to-r from-amber-500 to-orange-600 text-white"
            >
              <a href="#download" onClick={() => setOpen(false)}>
                <Download className="mr-1.5 h-4 w-4" />
                Download
              </a>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
