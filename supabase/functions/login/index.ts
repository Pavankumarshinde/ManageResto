// Edge Function: POST /functions/v1/login
// Supports login with email OR mobile number
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { login, password } = await req.json();

    if (!login || !password) {
      return errorResponse('Missing credentials', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Resolve mobile → email if login looks like a phone number
    let email = login;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)) {
      // Not an email — treat as mobile, look up the email
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('mobile', login)
        .maybeSingle();

      if (error || !profile) {
        return errorResponse('Invalid credentials', 401);
      }

      // Get email from auth.users via admin API
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(profile.id);
      if (userError || !userData?.user?.email) {
        return errorResponse('Invalid credentials', 401);
      }
      email = userData.user.email;
    }

    // Authenticate with Supabase Auth REST API
    const authApiUrl = `${Deno.env.get('SUPABASE_URL')}/auth/v1/token?grant_type=password`;
    const tokenResp = await fetch(authApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
      },
      body: JSON.stringify({ email, password }),
    });

    const tokenData = await tokenResp.json();

    if (!tokenResp.ok || !tokenData.access_token) {
      return errorResponse('Invalid credentials', 401);
    }

    // Fetch profile data
    const userId = tokenData.user?.id;
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    return jsonResponse({
      token: tokenData.access_token,
      user: {
        id: userId,
        restaurantName: profile?.restaurant_name || '',
        email: tokenData.user?.email || email,
        mobile: profile?.mobile || '',
        location: profile?.location || null,
        gstNumber: profile?.gst_number || null,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return errorResponse('Login failed', 500);
  }
});
