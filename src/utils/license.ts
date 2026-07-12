/**
 * License validation using Asymmetric Cryptography (ECDSA P-256).
 * POS client contains only the public key, ensuring signature generation is impossible without the private key.
 */

const publicKeyJwk = {
  "kty": "EC",
  "x": "Uh5HYd2518GLziIVOmq2nVJ0_RxtcWG_RWE11RZNHG0",
  "y": "U3xFREfYS0_j1BGsbdD99REMUBksUPCI_8KT_ZinsWw",
  "crv": "P-256"
};

/**
 * Decodes and validates a provided license activation key.
 * Expected format: RESPOS-[PlanCode]-[ExpiryTimestamp]-[ECDSA-P256-Hex-Signature]
 * Plan Codes: M01 (Monthly), M06 (6-Month), Y01 (Yearly), LIF (Lifetime)
 */
export async function parseAndValidateLicense(key: string, restaurantCode: string): Promise<{ 
  isValid: boolean; 
  plan: 'monthly' | 'half-yearly' | 'yearly' | 'lifetime' | null; 
  expiry: number | null; 
  message: string;
}> {
  try {
    const cleanKey = key.trim().toUpperCase();
    const parts = cleanKey.split('-');
    
    if (parts.length !== 4 || parts[0] !== 'RESPOS') {
      return { isValid: false, plan: null, expiry: null, message: 'Invalid license key format!' };
    }

    const planCode = parts[1];
    const expiryStr = parts[2];
    const signature = parts[3];

    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry)) {
      return { isValid: false, plan: null, expiry: null, message: 'Invalid expiration timestamp!' };
    }

    if (expiry < Date.now()) {
      return { isValid: false, plan: null, expiry: null, message: 'License key has already expired!' };
    }

    let plan: 'monthly' | 'half-yearly' | 'yearly' | 'lifetime' = 'monthly';
    if (planCode === 'M01') plan = 'monthly';
    else if (planCode === 'M06') plan = 'half-yearly';
    else if (planCode === 'Y01') plan = 'yearly';
    else if (planCode === 'LIF') plan = 'lifetime';
    else {
      return { isValid: false, plan: null, expiry: null, message: 'Invalid Plan Code!' };
    }

    // ECDSA Signature Verification
    const raw = `${planCode}-${expiryStr}-${restaurantCode}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(raw);

    const pubKey = await window.crypto.subtle.importKey(
      "jwk",
      publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"]
    );

    const matches = signature.match(/.{1,2}/g);
    if (!matches) {
      return { isValid: false, plan: null, expiry: null, message: 'Invalid license key signature format!' };
    }

    const sigBytes = new Uint8Array(matches.map(byte => parseInt(byte, 16)));

    const isValid = await window.crypto.subtle.verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      pubKey,
      sigBytes,
      data
    );

    if (!isValid) {
      return { isValid: false, plan: null, expiry: null, message: 'License key verification failed (Invalid signature)!' };
    }

    return { isValid: true, plan, expiry, message: 'License verified successfully!' };
  } catch (err: any) {
    console.error('License verification error:', err);
    return { isValid: false, plan: null, expiry: null, message: `License verification failed: ${err.message || err}` };
  }
}
