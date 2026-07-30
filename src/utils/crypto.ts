// src/utils/crypto.ts

const SECRET_SALT = import.meta.env.VITE_CRYPTO_SALT || "siya-bill-dlq-salt-2026";
const PASS = import.meta.env.VITE_CRYPTO_PASS || "siya-secure-local-log-password";
const LEGACY_SALT = "siya-bill-dlq-salt-2026";
const LEGACY_PASS = "siya-secure-local-log-password";

const HIGH_ITERATIONS = 600_000;
const LEGACY_ITERATIONS = 1000;

async function deriveKey(
  password: string = PASS,
  userId = '',
  customSalt = SECRET_SALT,
  iterations = HIGH_ITERATIONS
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  
  const salt = encoder.encode(customSalt + userId);
  
  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: iterations,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptText(text: string): Promise<string> {
  try {
    const userId = localStorage.getItem('activeUserId') || '';
    const key = await deriveKey(PASS, userId, SECRET_SALT, HIGH_ITERATIONS);
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );
    
    const encryptedBytes = new Uint8Array(encryptedBuffer);
    const combined = new Uint8Array(iv.length + encryptedBytes.length);
    combined.set(iv, 0);
    combined.set(encryptedBytes, iv.length);
    
    return Array.from(combined).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    if (import.meta.env.DEV) {
      console.error('[Crypto] Encryption failed:', err);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cart-encryption-warning', { detail: 'Cart encryption failed' }));
    }
    return text; // Fallback to plain text in case of environment limitations
  }
}

export async function decryptText(hex: string): Promise<string> {
  try {
    const matches = hex.match(/.{1,2}/g);
    if (!matches) return hex;
    
    const combined = new Uint8Array(matches.map(byte => parseInt(byte, 16)));
    if (combined.length < 12) return hex;
    
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const userId = localStorage.getItem('activeUserId') || '';
    
    // 1. Try modern key (600,000 iterations with current env secrets & userId)
    try {
      const key = await deriveKey(PASS, userId, SECRET_SALT, HIGH_ITERATIONS);
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        data
      );
      return new TextDecoder().decode(decryptedBuffer);
    } catch (_) {
      // 2. Fallback: Legacy key (1000 iterations with userId)
      try {
        const legacyKey = await deriveKey(PASS, userId, SECRET_SALT, LEGACY_ITERATIONS);
        const decryptedBuffer = await window.crypto.subtle.decrypt(
          { name: "AES-GCM", iv: iv },
          legacyKey,
          data
        );
        return new TextDecoder().decode(decryptedBuffer);
      } catch (_) {
        // 3. Fallback: Legacy key (1000 iterations with static legacy pass/salt & empty userId)
        const staticLegacyKey = await deriveKey(LEGACY_PASS, '', LEGACY_SALT, LEGACY_ITERATIONS);
        const decryptedBuffer = await window.crypto.subtle.decrypt(
          { name: "AES-GCM", iv: iv },
          staticLegacyKey,
          data
        );
        return new TextDecoder().decode(decryptedBuffer);
      }
    }
  } catch (err) {
    // Return original text on decryption failure (supports legacy plain text entries)
    return hex;
  }
}
