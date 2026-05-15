// Edge Function: POST /functions/v1/support
// Forwards support queries to admin email via Resend
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  // Validate JWT
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
    const { query } = await req.json();
    if (!query || query.trim().length < 5) {
      return errorResponse('Please enter a valid query (min 5 characters)', 400);
    }

    // Fetch profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('restaurant_name, mobile, location')
      .eq('id', user.id)
      .single();

    const adminEmail = 'pavankumarshinde08@gmail.com';
    const html = `
      <div style="font-family:sans-serif;padding:20px;border:1px solid #eee;border-radius:10px;max-width:600px;margin:auto;">
        <h2 style="color:#871f28;border-bottom:2px solid #871f28;padding-bottom:10px;">New Support Query</h2>
        <div style="margin-top:20px;">
          <p><strong>Restaurant:</strong> ${profile?.restaurant_name || 'N/A'}</p>
          <p><strong>Sender:</strong> ${user.email}</p>
          <p><strong>Mobile:</strong> ${profile?.mobile || 'N/A'}</p>
          <p><strong>Location:</strong> ${profile?.location || 'Not set'}</p>
          <hr style="border:0;border-top:1px solid #eee;margin:20px 0;">
          <p><strong>Query:</strong></p>
          <div style="background:#f9f9f9;padding:15px;border-radius:5px;font-style:italic;">
            ${query.replace(/\n/g, '<br>')}
          </div>
        </div>
        <p style="color:#999;font-size:12px;margin-top:30px;">Sent from ManageResto Support Form.</p>
      </div>
    `;

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (apiKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: 'ManageResto Support <onboarding@resend.dev>',
          to: [adminEmail],
          subject: `[Support] Query from ${profile?.restaurant_name || user.email}`,
          html,
        }),
      });
    }

    console.log(`📨 Support query from ${user.email}: ${query}`);
    return jsonResponse({ success: true, message: 'Query sent successfully' });
  } catch (err) {
    console.error('Support error:', err);
    return errorResponse('Failed to send query', 500);
  }
});
