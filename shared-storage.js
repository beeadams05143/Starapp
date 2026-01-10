import { SUPABASE_URL, SUPABASE_ANON_KEY, getSessionFromStorage } from './supabaseClient.js?v=2025.01.09E';

function requireSession() {
  const session = getSessionFromStorage();
  if (!session?.access_token || !session?.user?.id) {
    throw new Error('Supabase session required');
  }
  return session;
}

async function requestStorage(path, { method = 'GET', headers = {}, body } = {}) {
  const session = requireSession();
  const mergedHeaders = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session.access_token}`,
    ...headers,
  };
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${path}`, {
    method,
    headers: mergedHeaders,
    body,
  });
  return res;
}

export async function uploadJsonToBucket(bucket, objectPath, payload, { upsert = true } = {}) {
  const body = JSON.stringify(payload ?? {});
  const headers = {
    'Content-Type': 'application/json',
    'x-upsert': upsert ? 'true' : 'false',
  };
  const res = await requestStorage(`${bucket}/${objectPath}`, { method: 'POST', headers, body });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Storage upload failed');
  }
  return true;
}

export async function downloadJsonFromBucket(bucket, objectPath) {
  try {
    const res = await requestStorage(`${bucket}/${objectPath}`, { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await res.text());
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch (error) {
    if (/not found/i.test(error?.message || '')) return null;
    console.warn('[storage] download failed', error);
    return null;
  }
}
