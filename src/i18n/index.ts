/**
 * i18n — Siya Bill Translation System
 *
 * Lightweight custom i18n — no external library required.
 * Usage in printer.ts / any TS file:
 *   import { getBillTranslations } from '../i18n';
 *   const t = getBillTranslations('hi');
 *   t.bill.billNo  // → "Bill Sankhya"
 */
import { en } from './locales/en';
import { hi } from './locales/hi';
import type { BillTranslations } from './locales/en';

/** Supported language codes */
export type SupportedLocale = 'en' | 'hi';

/** All locale data */
const locales: Record<SupportedLocale, BillTranslations> = { en, hi };

/** Human-readable language names for Settings UI */
export const LOCALE_NAMES: Record<SupportedLocale, { label: string; nativeLabel: string; flag: string }> = {
  en: { label: 'English',         nativeLabel: 'English',     flag: '🇬🇧' },
  hi: { label: 'Hindi (Hinglish)',nativeLabel: 'हिंदी',         flag: '🇮🇳' },
};

/**
 * Get translations for a given locale.
 * Falls back to English if locale is unknown.
 */
export function getBillTranslations(locale?: string): BillTranslations {
  const code = (locale || 'en') as SupportedLocale;
  return locales[code] ?? locales['en'];
}

export type { BillTranslations };
