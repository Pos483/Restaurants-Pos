/**
 * ══════════════════════════════════════════════════════════════════════
 * 🔐 LICENSE VALIDATION — Unit Tests
 * ══════════════════════════════════════════════════════════════════════
 *
 * ये tests ECDSA P-256 license key validation को जाँचती हैं।
 * (src/utils/license.ts)
 *
 * Note: WebCrypto API की tests हैं — tests/setup.ts में crypto mock है।
 * ══════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { parseAndValidateLicense } from '../src/utils/license';

// ══════════════════════════════════════════════════════════════════════════════
// ✅ TEST SUITE 1: License Key Format Validation
// ══════════════════════════════════════════════════════════════════════════════
describe('🔑 License Key Format (लाइसेंस की फ़ॉर्मेट जाँच)', () => {

  it('खाली key invalid होनी चाहिए', async () => {
    const result = await parseAndValidateLicense('', 'TEST001');
    expect(result.isValid).toBe(false);
    expect(result.plan).toBeNull();
    expect(result.expiry).toBeNull();
  });

  it('गलत prefix वाली key invalid होनी चाहिए', async () => {
    const result = await parseAndValidateLicense('WRONG-M01-123456-ABCDEF', 'TEST001');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('Invalid license key format');
  });

  it('सिर्फ 3 parts वाली key invalid होनी चाहिए', async () => {
    const result = await parseAndValidateLicense('RESPOS-M01-123456', 'TEST001');
    expect(result.isValid).toBe(false);
  });

  it('5 parts वाली key invalid होनी चाहिए', async () => {
    const result = await parseAndValidateLicense('RESPOS-M01-123456-ABCD-EXTRA', 'TEST001');
    expect(result.isValid).toBe(false);
  });

  it('गलत plan code वाली key invalid होनी चाहिए', async () => {
    const futureTimestamp = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 दिन बाद
    const result = await parseAndValidateLicense(`RESPOS-XXX-${futureTimestamp}-AABBCC`, 'TEST001');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('Invalid Plan Code');
  });

  it('numeric timestamp की जगह letters होने पर invalid होनी चाहिए', async () => {
    const result = await parseAndValidateLicense('RESPOS-M01-NOTANUMBER-AABBCC', 'TEST001');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('Invalid expiration timestamp');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ✅ TEST SUITE 2: License Expiry Validation
// ══════════════════════════════════════════════════════════════════════════════
describe('⏰ License Expiry (लाइसेंस समाप्ति जाँच)', () => {

  it('पुरानी (expired) timestamp वाली key invalid होनी चाहिए', async () => {
    const pastTimestamp = Date.now() - 1000; // 1 सेकंड पहले expire हो गई
    const result = await parseAndValidateLicense(`RESPOS-M01-${pastTimestamp}-AABBCC`, 'TEST001');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('expired');
  });

  it('आज की timestamp वाली key भी expired मानी जानी चाहिए', async () => {
    const nowTimestamp = Date.now() - 100; // अभी expire
    const result = await parseAndValidateLicense(`RESPOS-Y01-${nowTimestamp}-AABBCC`, 'TEST001');
    expect(result.isValid).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ✅ TEST SUITE 3: Plan Code Mapping
// ══════════════════════════════════════════════════════════════════════════════
describe('📋 Plan Code Mapping (प्लान कोड — सिग्नेचर verify से पहले)', () => {
  // Note: ये tests signature verify से पहले fail होंगी (signature fake है)
  // लेकिन plan code और format validation सही काम करे — यह check करते हैं।

  const futureTimestamp = (Date.now() + 365 * 24 * 60 * 60 * 1000).toString();

  it('M01 plan code के साथ format valid होनी चाहिए (signature check पर fail होगी)', async () => {
    const result = await parseAndValidateLicense(`RESPOS-M01-${futureTimestamp}-AABBCCDDEEFF`, 'TEST001');
    // signature invalid है, पर message "Invalid Plan Code" नहीं होना चाहिए
    expect(result.message).not.toContain('Invalid Plan Code');
    expect(result.message).not.toContain('Invalid expiration');
    expect(result.message).not.toContain('Invalid license key format');
  });

  it('M06 plan code के साथ format valid होनी चाहिए', async () => {
    const result = await parseAndValidateLicense(`RESPOS-M06-${futureTimestamp}-AABBCCDDEEFF`, 'TEST001');
    expect(result.message).not.toContain('Invalid Plan Code');
  });

  it('Y01 plan code के साथ format valid होनी चाहिए', async () => {
    const result = await parseAndValidateLicense(`RESPOS-Y01-${futureTimestamp}-AABBCCDDEEFF`, 'TEST001');
    expect(result.message).not.toContain('Invalid Plan Code');
  });

  it('LIF plan code के साथ format valid होनी चाहिए', async () => {
    const result = await parseAndValidateLicense(`RESPOS-LIF-${futureTimestamp}-AABBCCDDEEFF`, 'TEST001');
    expect(result.message).not.toContain('Invalid Plan Code');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ✅ TEST SUITE 4: Return Structure Validation
// ══════════════════════════════════════════════════════════════════════════════
describe('📦 Return Structure (वापसी का structure)', () => {

  it('हर result में isValid, plan, expiry, message होना चाहिए', async () => {
    const result = await parseAndValidateLicense('INVALID', 'TEST001');
    expect(result).toHaveProperty('isValid');
    expect(result).toHaveProperty('plan');
    expect(result).toHaveProperty('expiry');
    expect(result).toHaveProperty('message');
  });

  it('invalid result में plan और expiry null होने चाहिए', async () => {
    const result = await parseAndValidateLicense('COMPLETELY-WRONG', 'TEST001');
    expect(result.isValid).toBe(false);
    expect(result.plan).toBeNull();
    expect(result.expiry).toBeNull();
  });

  it('message एक non-empty string होनी चाहिए', async () => {
    const result = await parseAndValidateLicense('BAD-KEY', 'TEST001');
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('key case-insensitive होनी चाहिए (lowercase भी accept हो)', async () => {
    // parseAndValidateLicense में .toUpperCase() होता है
    const resultUpper = await parseAndValidateLicense('RESPOS-M01-123-ABC', 'TEST001');
    const resultLower = await parseAndValidateLicense('respos-m01-123-abc', 'TEST001');
    // दोनों same result देने चाहिए
    expect(resultUpper.isValid).toBe(resultLower.isValid);
    expect(resultUpper.message).toBe(resultLower.message);
  });
});
