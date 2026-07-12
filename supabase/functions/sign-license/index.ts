import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Hardcoded default key (used as fallback if LICENSE_PRIVATE_KEY environment secret is not set)
const DEFAULT_PRIVATE_KEY_JWK = {
  "kty": "EC",
  "x": "Uh5HYd2518GLziIVOmq2nVJ0_RxtcWG_RWE11RZNHG0",
  "y": "U3xFREfYS0_j1BGsbdD99REMUBksUPCI_8KT_ZinsWw",
  "crv": "P-256",
  "d": "bIscXMKHB8Y0lXHmJ_Kqa0cQHpOK3zbWNSK5VxPISHI"
};

serve(async (req) => {
  // CORS Headers for API accessibility
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Initialize Supabase Client with caller's JWT to verify their identity
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Retrieve and verify the user session
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: `Unauthorized: User session invalid - ${userError?.message || ''}` }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Strict Access Control: only the developer/superadmin (gudduk483@gmail.com) can sign licenses
    if (user.email !== 'gudduk483@gmail.com') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only the superadmin can generate license signatures' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse input parameters
    const { planCode, expiry, restaurantCode } = await req.json()
    if (!planCode || !expiry || !restaurantCode) {
      return new Response(JSON.stringify({ error: 'Bad Request: Missing parameters (planCode, expiry, restaurantCode)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Load private key (from environment variable first, then fallback to default)
    let privateKeyJwk = DEFAULT_PRIVATE_KEY_JWK;
    const envPrivateKey = Deno.env.get('LICENSE_PRIVATE_KEY');
    if (envPrivateKey) {
      try {
        privateKeyJwk = JSON.parse(envPrivateKey);
      } catch (parseErr) {
        console.error('Failed to parse LICENSE_PRIVATE_KEY secret from env:', parseErr);
      }
    }

    // Generate asymmetric ECDSA P-256 signature
    const raw = `${planCode}-${expiry}-${restaurantCode}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(raw);

    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      privateKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      cryptoKey,
      data
    );

    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const signature = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

    return new Response(JSON.stringify({ signature }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
