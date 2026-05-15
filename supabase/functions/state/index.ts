// Edge Function: GET + POST /functions/v1/state
// GET  → Returns user's RestoState JSON blob
// POST → Updates user's RestoState JSON blob (triggers Realtime)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

// In-process save lock per user to prevent concurrent writes
const saveLocks = new Set<string>();

async function getUserFromToken(supabase: ReturnType<typeof createClient>) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Extract auth token
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') ?? req.url.split('token=')[1];
  if (!token) return errorResponse('Unauthorized', 401);

  // Create user-scoped client (validates JWT automatically)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const user = await getUserFromToken(supabase);
  if (!user) return errorResponse('Unauthorized', 401);

  const userId = user.id;

  // ─── GET: return state ───────────────────────────────────────
  if (req.method === 'GET') {
    try {
      let { data: state } = await supabase
        .from('resto_states')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!state) {
        // Create initial state if missing
        const { data: newState } = await supabase
          .from('resto_states')
          .insert({ user_id: userId, menu: [], orders: [], waiters: [], categories: [], next_order_id: 1, next_menu_id: 100 })
          .select()
          .single();
        state = newState;
      }

      // Return in the same shape the frontend expects
      return jsonResponse({
        menu: state.menu || [],
        orders: state.orders || [],
        waiters: state.waiters || [],
        categories: state.categories || [],
        nextOrderId: state.next_order_id || 1,
        nextMenuId: state.next_menu_id || 100,
        updatedAt: state.updated_at,
      });
    } catch (err) {
      console.error('State GET error:', err);
      return errorResponse('Failed to fetch state', 500);
    }
  }

  // ─── POST: update state ──────────────────────────────────────
  if (req.method === 'POST') {
    // Prevent concurrent saves for the same user
    if (saveLocks.has(userId)) {
      return errorResponse('Update already in progress', 429);
    }
    saveLocks.add(userId);

    try {
      const body = await req.json();
      const { menu, orders, nextOrderId, nextMenuId, waiters, categories } = body;

      // Build only the fields that were sent
      const updates: Record<string, unknown> = {};
      if (menu !== undefined) updates.menu = menu;
      if (orders !== undefined) updates.orders = orders;
      if (waiters !== undefined) updates.waiters = waiters;
      if (categories !== undefined) updates.categories = categories;
      if (nextOrderId !== undefined) updates.next_order_id = nextOrderId;
      if (nextMenuId !== undefined) updates.next_menu_id = nextMenuId;
      // Always bump updated_at so Realtime fires
      updates.updated_at = new Date().toISOString();

      // Upsert: creates row if not exists, updates if exists
      const { data: state, error } = await supabase
        .from('resto_states')
        .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;

      const stateResponse = {
        menu: state.menu || [],
        orders: state.orders || [],
        waiters: state.waiters || [],
        categories: state.categories || [],
        nextOrderId: state.next_order_id || 1,
        nextMenuId: state.next_menu_id || 100,
        updatedAt: state.updated_at,
      };

      return jsonResponse({ success: true, state: stateResponse });
    } catch (err) {
      console.error('State POST error:', err);
      return errorResponse('Failed to update state', 500);
    } finally {
      saveLocks.delete(userId);
    }
  }

  return errorResponse('Method not allowed', 405);
});
