// ManageResto – Supabase Client Initialization
// Loaded before app.js in index.html

const SUPABASE_URL = 'https://vlwrrtziwzpvbfthgerd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsd3JydHppd3pwdmJmdGhnZXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MTc5MzQsImV4cCI6MjA5MjE5MzkzNH0.4nOsSO9TfT2mrFLNKzukesAS48VXK-mOn0E_3zkiXVc';

// Edge Functions base URL (where all API calls go)
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

// Initialize the Supabase JS client (used for Realtime subscriptions + auth)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: { eventsPerSecond: 10 }
  }
});
