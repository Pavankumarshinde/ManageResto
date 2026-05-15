// Edge Function: POST /functions/v1/forgot-password
// Handles 3 actions in one function: 'request' | 'verify' | 'reset'
// Preserves the existing 6-digit OTP UX flow via Resend email API
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

async function sendOTPEmail(to: string, otp: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.log(`📧 Resend key missing – OTP for ${to}: ${otp}`);
    return;
  }

  const html = `
    <div style="font-family:sans-serif;padding:20px;text-align:center;">
      <h2 style="color:#871f28;">ManageResto</h2>
      <p>Your One-Time Password (OTP) to reset your password is:</p>
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
      subject: 'Your OTP for Password Reset',
      html,
    }),
  });
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    const { action } = body;

    // ─── ACTION: request OTP ─────────────────────────────────
    if (action === 'request') {
      const { identifier } = body; // email or mobile

      // Find user: check email first, then mobile
      let userEmail = identifier;
      let userId: string | null = null;

      // Try to find via profiles (handles mobile)
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
      if (!isEmail) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('mobile', identifier)
          .maybeSingle();
        if (!profile) return errorResponse('User not found', 404);
        const { data: userData } = await supabase.auth.admin.getUserById(profile.id);
        if (!userData?.user?.email) return errorResponse('User not found', 404);
        userEmail = userData.user.email;
        userId = profile.id;
      } else {
        const { data: users } = await supabase.auth.admin.listUsers();
        const found = users?.users?.find((u) => u.email === identifier);
        if (!found) return errorResponse('User not found', 404);
        userId = found.id;
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();

      await supabase.from('password_reset_otps').upsert(
        { identifier, otp, expires_at: expiresAt },
        { onConflict: 'identifier' },
      );

      await sendOTPEmail(userEmail, otp);
      console.log(`🔑 OTP for ${identifier}: ${otp}`);

      return jsonResponse({ success: true, message: 'OTP sent successfully' });
    }

    // ─── ACTION: verify OTP ──────────────────────────────────
    if (action === 'verify') {
      const { identifier, otp } = body;
      const { data: record } = await supabase
        .from('password_reset_otps')
        .select('*')
        .eq('identifier', identifier)
        .eq('otp', otp)
        .maybeSingle();

      if (!record || new Date(record.expires_at) < new Date()) {
        return errorResponse('Invalid or expired OTP', 400);
      }

      return jsonResponse({ success: true });
    }

    // ─── ACTION: reset password ──────────────────────────────
    if (action === 'reset') {
      const { identifier, otp, newPassword } = body;

      // Re-verify OTP
      const { data: record } = await supabase
        .from('password_reset_otps')
        .select('*')
        .eq('identifier', identifier)
        .eq('otp', otp)
        .maybeSingle();

      if (!record || new Date(record.expires_at) < new Date()) {
        return errorResponse('Session expired', 400);
      }

      // Find user ID
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
      let userId: string | null = null;

      if (!isEmail) {
        const { data: profile } = await supabase
          .from('profiles').select('id').eq('mobile', identifier).maybeSingle();
        userId = profile?.id ?? null;
      } else {
        const { data: users } = await supabase.auth.admin.listUsers();
        userId = users?.users?.find((u) => u.email === identifier)?.id ?? null;
      }

      if (!userId) return errorResponse('User not found', 404);

      // Update password via Supabase Auth admin
      const { error } = await supabase.auth.admin.updateUserById(userId, { password: newPassword });
      if (error) return errorResponse('Failed to reset password', 500);

      // Clean up OTP
      await supabase.from('password_reset_otps').delete().eq('identifier', identifier);

      return jsonResponse({ success: true, message: 'Password updated successfully' });
    }

    return errorResponse('Invalid action', 400);
  } catch (err) {
    console.error('Forgot password error:', err);
    return errorResponse('Operation failed', 500);
  }
});
