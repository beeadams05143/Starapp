import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  getSessionFromStorage as coreGetSessionFromStorage,
  ensureSession as coreEnsureSession,
} from './supabaseClient.js?v=2025.01.09E';

export function getSessionFromStorage() {
  return coreGetSessionFromStorage();
}

export async function requireSession() {
  const session = await coreEnsureSession();
  if (!session?.access_token) throw new Error('Supabase session required');
  return session;
}

export async function rest(path, { method = 'GET', headers = {}, body } = {}) {
  const session = await requireSession();
  const authHeaders = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': body instanceof FormData ? undefined : 'application/json',
    ...headers,
  };

  if (authHeaders['Content-Type'] === undefined) {
    delete authHeaders['Content-Type'];
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: authHeaders,
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Supabase REST error ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}
