/**
 * ══════════════════════════════════════════════════════════════════════
 * 🛠️ UTILITY FUNCTIONS — Unit Tests
 * ══════════════════════════════════════════════════════════════════════
 *
 * ये tests सभी utility functions को जाँचती हैं:
 * - escapeHtml    (XSS attack रोकना)
 * - logger        (Dev/Prod logging behavior)
 * ══════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { escapeHtml } from '../src/utils/escapeHtml';

// ══════════════════════════════════════════════════════════════════════════════
// ✅ TEST SUITE 1: escapeHtml — XSS Prevention
// ══════════════════════════════════════════════════════════════════════════════
describe('🔒 escapeHtml (XSS सुरक्षा)', () => {

  it('सामान्य text बिना बदलाव के return होनी चाहिए', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('Hindi text बिना बदलाव के return होनी चाहिए', () => {
    expect(escapeHtml('नमस्ते रेस्टोरेंट')).toBe('नमस्ते रेस्टोरेंट');
  });

  it('& को &amp; में बदला जाना चाहिए', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('< को &lt; में बदला जाना चाहिए (XSS injection रोकना)', () => {
    expect(escapeHtml('<script>alert("hack")</script>')).toBe('&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;');
  });

  it('> को &gt; में बदला जाना चाहिए', () => {
    expect(escapeHtml('5 > 3')).toBe('5 &gt; 3');
  });

  it('" को &quot; में बदला जाना चाहिए', () => {
    expect(escapeHtml('"Siya Bill"')).toBe('&quot;Siya Bill&quot;');
  });

  it("' को &#39; में बदला जाना चाहिए", () => {
    expect(escapeHtml("Ramesh's Restaurant")).toBe("Ramesh&#39;s Restaurant");
  });

  it('खाली string पर खाली string return होनी चाहिए', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('undefined पर खाली string return होनी चाहिए', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('null पर खाली string return होनी चाहिए', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('सभी special characters एक साथ escape होने चाहिए', () => {
    const input = '<div class="test" data-val=\'1\'>5 & 6 > 3</div>';
    const expected = '&lt;div class=&quot;test&quot; data-val=&#39;1&#39;&gt;5 &amp; 6 &gt; 3&lt;/div&gt;';
    expect(escapeHtml(input)).toBe(expected);
  });

  it('Restaurant name with special chars PDF-safe होनी चाहिए', () => {
    expect(escapeHtml('Sharma & Sons')).toBe('Sharma &amp; Sons');
    expect(escapeHtml('R.K. Restaurant & Bar')).toBe('R.K. Restaurant &amp; Bar');
  });

  it('number को string की तरह handle करे', () => {
    // @ts-ignore — runtime check
    expect(escapeHtml(123)).toBe('123');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ✅ TEST SUITE 2: Logger — Conditional Logging
// ══════════════════════════════════════════════════════════════════════════════
describe('📝 Logger (लॉगिंग व्यवहार)', () => {

  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logger object में log, warn, error, info methods होने चाहिए', async () => {
    // Dynamic import (import.meta.env.DEV use करता है)
    const { logger } = await import('../src/utils/logger');
    expect(typeof logger.log).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.info).toBe('function');
  });

  it('logger.error production में भी call होनी चाहिए', async () => {
    const { logger } = await import('../src/utils/logger');
    logger.error('test error');
    expect(consoleErrorSpy).toHaveBeenCalledWith('test error');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ✅ TEST SUITE 3: getLocalDateString — Extra Scenarios
// ══════════════════════════════════════════════════════════════════════════════
import { getLocalDateString } from '../src/types';

describe('📅 getLocalDateString — अतिरिक्त जाँच', () => {

  it('Leap Year (2024) February 29 सही format में होनी चाहिए', () => {
    const date = new Date(2024, 1, 29); // 29 Feb 2024
    expect(getLocalDateString(date)).toBe('2024-02-29');
  });

  it('Year 2000 (Y2K) date सही होनी चाहिए', () => {
    const date = new Date(2000, 0, 1); // 1 Jan 2000
    expect(getLocalDateString(date)).toBe('2000-01-01');
  });

  it('result की length हमेशा 10 characters होनी चाहिए', () => {
    const result = getLocalDateString(new Date());
    expect(result.length).toBe(10);
  });

  it('result में 2 hyphens होने चाहिए', () => {
    const result = getLocalDateString(new Date());
    const hyphens = (result.match(/-/g) || []).length;
    expect(hyphens).toBe(2);
  });
});
