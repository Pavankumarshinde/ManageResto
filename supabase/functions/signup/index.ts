// Edge Function: POST /functions/v1/signup
// Creates Supabase Auth user + profile + seeds initial data
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const CATEGORIES = [
  'Starter', 'Tandoori Starter', 'Soup', 'Biryani',
  'Curry', 'Rice & Noodles', 'Breads', 'Dessert', 'Beverage',
];

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { restaurantName, email, mobile, location, gstNumber, password } = await req.json();

    if (!restaurantName || !email || !mobile || !password) {
      return errorResponse('Missing required fields', 400);
    }

    // Admin client — uses service role key to bypass RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Check if mobile already exists in profiles
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('mobile', mobile)
      .maybeSingle();

    if (existingProfile) {
      return errorResponse('Mobile number already registered', 400);
    }

    // 2. Create Supabase Auth user (email + password)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Skip confirmation email for immediate access
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        return errorResponse('Email already registered', 400);
      }
      return errorResponse(authError.message, 400);
    }

    const userId = authData.user.id;

    // 3. Create profile record
    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      restaurant_name: restaurantName,
      mobile,
      location: location || null,
      gst_number: gstNumber || null,
    });

    if (profileError) {
      // Rollback auth user if profile creation failed
      await supabase.auth.admin.deleteUser(userId);
      return errorResponse('Failed to create profile', 500);
    }

    // 4. Seed initial categories
    await supabase.from('categories').insert(
      CATEGORIES.map((name) => ({ name, user_id: userId })),
    );

    // 5. Create initial RestoState
    await supabase.from('resto_states').insert({
      user_id: userId,
      menu: [],
      orders: [],
      waiters: [],
      categories: CATEGORIES,
      next_order_id: 1,
      next_menu_id: 100,
    });

    // 6. Sign in to get access token for immediate use
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

    return jsonResponse({
      token: tokenData.access_token,
      user: {
        id: userId,
        restaurantName,
        email,
        mobile,
        location: location || null,
        gstNumber: gstNumber || null,
      },
    });
  } catch (err) {
    console.error('Signup error:', err);
    return errorResponse('Signup failed', 500);
  }
});
