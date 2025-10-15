// /js/supabaseClient.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const BUILD_VERSION = '2025.10.15d';

// ⚠️ Keep straight quotes only
const SUPABASE_URL = 'https://okfsobfyhpforyqogjea.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rZnNvYmZ5aHBmb3J5cW9namVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2MTg3NDAsImV4cCI6MjA2ODE5NDc0MH0.qtuG1_LbSPdeRtnyElo-F0agTSGclqQQyap-USHKWFw';

// Create once; reuse if already present (prevents duplicate clients in hot reloads)
const options = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // needed for magic-link / PKCE flows
    // flowType: 'pkce', // uncomment if you later use OAuth PKCE redirects
  },
  // db: { schema: 'public' }, // default is 'public'; keep or customize
};

export const supabase =
  (typeof window !== 'undefined' && window.supabase)
    ? window.supabase
    : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options);

// Expose globally so non-module scripts and inline helpers can use it
if (typeof window !== 'undefined') {
  window.STAR_BUILD_VERSION = window.STAR_BUILD_VERSION || BUILD_VERSION;
  window.supabase = supabase;   // <-- this is the one your smoke test/Save code expects
  window.sb = supabase;         // optional alias (keeps your previous window.sb)
}

// Convenience helpers (optional)
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user ?? null;
}

export async function signOut() {
  await supabase.auth.signOut();
}
