// Edge Function: GET /functions/v1/health
import { handleCors, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  return jsonResponse({
    status: 'ok',
    version: '2.0-supabase',
    platform: 'supabase-edge-functions',
    timestamp: new Date().toISOString(),
  });
});
