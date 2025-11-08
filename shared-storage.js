import { SUPABASE_URL, SUPABASE_ANON_KEY, getSessionFromStorage } from './supabaseClient.js?v=2025.10.16d';

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

async function signObject(bucket, objectPath, expiresIn = 60 * 5) {
  const session = requireSession();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 404 || /not found/i.test(text)) return null;
    throw new Error(text || 'Sign URL failed');
  }
  try {
    const data = text ? JSON.parse(text) : null;
    return data?.signedUrl ? `${SUPABASE_URL}${data.signedUrl}` : null;
  } catch {
    return null;
  }
}

export async function downloadJsonFromBucket(bucket, objectPath) {
  try {
    const signedUrl = await signObject(bucket, objectPath);
    if (!signedUrl) return null;
    const res = await fetch(signedUrl);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch (error) {
    if (/not found/i.test(error?.message || '')) return null;
    console.warn('[storage] download failed', error);
    return null;
  }
}
