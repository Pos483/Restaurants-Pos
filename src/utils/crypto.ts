// src/utils/crypto.ts

const SECRET_SALT = "siya-bill-dlq-salt-2026";
const PASS = "siya-secure-local-log-password";

async function deriveKey(password: string, userId = ''): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  
  const salt = encoder.encode(SECRET_SALT + userId);
  
  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 1000,
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
    const key = await deriveKey(PASS, userId);
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
    const key = await deriveKey(PASS, userId);
    
    try {
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        data
      );
      return new TextDecoder().decode(decryptedBuffer);
    } catch (decryptErr) {
      // Fallback: Decrypt using legacy static key (empty userId salt)
      const legacyKey = await deriveKey(PASS, '');
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        legacyKey,
        data
      );
      return new TextDecoder().decode(decryptedBuffer);
    }
  } catch (err) {
    // Return original text on decryption failure (supports legacy plain text entries)
    return hex;
  }
}
