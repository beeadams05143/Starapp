import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  getSessionFromStorage as coreGetSessionFromStorage,
  ensureSession as coreEnsureSession,
} from './supabaseClient.js?v=2026.10.29TEST1';

export function getSessionFromStorage() {
  return coreGetSessionFromStorage();
}

export async function requireSession() {
  const session = await coreEnsureSession();
  if (!session?.access_token) throw new Error('Your STAR TEST sign-in has expired. Please sign in again to view reports.');
  return session;
}

export async function rest(path, { method = 'GET', headers = {}, body, signal, expectedUserId } = {}) {
  const send = async (session) => {
    signal?.throwIfAborted();
    if (expectedUserId && session?.user?.id !== expectedUserId) {
      throw new Error('The signed-in caregiver changed. Return to the original account before submitting.');
    }
    const authHeaders = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': body instanceof FormData ? undefined : 'application/json',
      ...headers,
    };
    if (authHeaders['Content-Type'] === undefined) delete authHeaders['Content-Type'];
    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers: authHeaders, body, signal });
  };

  let session = await requireSession();
  let response = await send(session);
  if (response.status === 401) {
    session = await coreEnsureSession({ forceRefresh: true });
    if (!session?.access_token) throw new Error('Your STAR TEST sign-in has expired. Please sign in again to view reports.');
    response = await send(session);
  }

  if (!response.ok) {
    let errBody = {};
    try {
      errBody = await response.json();
    } catch (e) {
      console.error('Could not parse error body');
    }

    console.error('Supabase request failed with HTTP status', response.status);

    const error = new Error(errBody.message || 'Request failed');
    error.status = response.status;
    error.details = errBody.details;
    error.hint = errBody.hint;

    throw error;
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
