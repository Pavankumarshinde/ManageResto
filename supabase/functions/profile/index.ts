// Edge Function: POST /functions/v1/profile
// Actions: 'request-otp' | 'update'
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

async function sendProfileOTPEmail(to: string, otp: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.log(`📧 Profile edit OTP for ${to}: ${otp}`);
    return;
  }

  const html = `
    <div style="font-family:sans-serif;padding:20px;text-align:center;">
      <h2 style="color:#871f28;">ManageResto</h2>
      <p>Your OTP to edit your profile is:</p>
      <div style="font-size:32px;font-weight:bold;color:#1a1616;padding:10px;border:1px solid #ddd;display:inline-block;">
        ${otp}
      </div>
      <p style="color:#6c757d;font-size:14px;margin-top:20px;">This OTP expires in 10 minutes.</p>
    </div>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: 'ManageResto <onboarding@resend.dev>',
      to: [to],
      subject: 'Profile Edit Verification OTP',
      html,
    }),
  });
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  // Validate JWT token
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return errorResponse('Unauthorized', 401);

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) return errorResponse('Unauthorized', 401);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    const { action } = body;

    // ─── ACTION: request OTP ─────────────────────────────────
    if (action === 'request-otp') {
      const email = user.email!;
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();

      await supabaseAdmin.from('password_reset_otps').upsert(
        { identifier: email, otp, expires_at: expiresAt },
        { onConflict: 'identifier' },
      );

      await sendProfileOTPEmail(email, otp);
      return jsonResponse({ success: true, message: 'OTP sent successfully' });
    }

    // ─── ACTION: update profile ──────────────────────────────
    if (action === 'update') {
      const { otp, restaurantName, mobile, location, gstNumber } = body;
      const email = user.email!;

      // Verify OTP
      const { data: record } = await supabaseAdmin
        .from('password_reset_otps')
        .select('*')
        .eq('identifier', email)
        .eq('otp', otp)
        .maybeSingle();

      if (!record || new Date(record.expires_at) < new Date()) {
        return errorResponse('Invalid or expired OTP', 400);
      }

      // Update profile
      const { data: updatedProfile, error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          restaurant_name: restaurantName,
          mobile,
          location: location ?? null,
          gst_number: gstNumber ?? null,
        })
        .eq('id', user.id)
        .select()
        .single();

      if (updateError) return errorResponse('Update failed', 500);

      // Clean up OTP
      await supabaseAdmin.from('password_reset_otps').delete().eq('identifier', email);

      return jsonResponse({
        success: true,
        user: {
          id: user.id,
          restaurantName: updatedProfile.restaurant_name,
          email,
          mobile: updatedProfile.mobile,
          location: updatedProfile.location,
          gstNumber: updatedProfile.gst_number,
        },
      });
    }

    return errorResponse('Invalid action', 400);
  } catch (err) {
    console.error('Profile error:', err);
    return errorResponse('Operation failed', 500);
  }
});
