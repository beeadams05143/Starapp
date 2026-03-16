// Minimal Supabase REST client used across the STAR app
// Replaces @supabase/supabase-js which was hanging in certain browsers.

export const BUILD_VERSION = '2026.03.16B';
export const SUPABASE_URL = 'https://okfsobfyhpforyqogjea.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rZnNvYmZ5aHBmb3J5cW9namVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2MTg3NDAsImV4cCI6MjA2ODE5NDc0MH0.qtuG1_LbSPdeRtnyElo-F0agTSGclqQQyap-USHKWFw';

const AUTH_STORAGE_PREFIX = 'supabase.auth.token';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const APP_ID = 'starapp';

function extractProjectRef(url) {
  try {
    return new URL(url).hostname.split('.')[0] || 'unknown';
  } catch {
    return 'unknown';
  }
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

const PROJECT_REF = extractProjectRef(SUPABASE_URL);
const STORAGE_SCOPE = `${AUTH_STORAGE_PREFIX}:${APP_ID}:${PROJECT_REF}`;
const LEGACY_STORAGE_KEY = `${AUTH_STORAGE_PREFIX}-${btoa(SUPABASE_URL).slice(0, 12)}`;

function validateSupabaseConfig() {
  const payload = decodeJwtPayload(SUPABASE_ANON_KEY);
  const keyRef = payload?.ref || null;
  if (keyRef && PROJECT_REF !== 'unknown' && keyRef !== PROJECT_REF) {
    throw new Error(`[supabase] configuration mismatch: URL project "${PROJECT_REF}" does not match anon key ref "${keyRef}"`);
  }
}

validateSupabaseConfig();

function getStorageKey() {
  return STORAGE_SCOPE;
}

function readSessionAtKey(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.currentSession || parsed.session || null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    const key = getStorageKey();
    const payload = {
      currentSession: session,
      session,
      expiresAt:
        session?.expires_at ||
        Math.floor(Date.now() / 1000) + (session?.expires_in || 3600),
    };
    localStorage.setItem(key, JSON.stringify(payload));
    if (key !== LEGACY_STORAGE_KEY) localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (err) {
    console.warn('[supabase] unable to persist session', err);
  }
}

export function clearSavedSession() {
  try {
    const key = getStorageKey();
    localStorage.removeItem(key);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (err) {
    console.warn('[supabase] unable to clear session', err);
  }
}

export function getSessionFromStorage() {
  try {
    const key = getStorageKey();
    const current = readSessionAtKey(key);
    if (current) return current;
    const legacy = readSessionAtKey(LEGACY_STORAGE_KEY);
    if (legacy) {
      saveSession(legacy);
      return legacy;
    }
    return null;
  } catch (err) {
    console.warn('[supabase] unable to read session', err);
    return null;
  }
}

export function requireSession() {
  const session = getSessionFromStorage();
  if (!session?.access_token || !session?.user?.id) {
    throw new Error('Supabase session missing');
  }
  return session;
}

const REFRESH_MARGIN_SECONDS = 60;

function normalizeSession(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.session) return payload.session;
  if (!payload.access_token) return null;
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || null,
    expires_in: payload.expires_in ?? null,
    expires_at:
      payload.expires_at ??
      (payload.expires_in ? Math.floor(Date.now() / 1000) + Number(payload.expires_in || 0) : null),
    token_type: payload.token_type || 'bearer',
    user: payload.user ?? null,
  };
}

async function refreshSession(session) {
  if (!session?.refresh_token) return session;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(text || `Refresh failed ${res.status}`);
    }
    const payload = text ? JSON.parse(text) : null;
    const fresh = normalizeSession(payload) || session;
    if (payload?.user) fresh.user = payload.user;
    saveSession(fresh);
    return fresh;
  } catch (err) {
    console.warn('[supabase] refresh session failed', err);
    return session;
  }
}

export async function ensureSession() {
  let session = getSessionFromStorage();
  if (!session) return null;
  const expiresAt = session.expires_at || session.expiresAt || null;
  if (!expiresAt) return session;
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt - REFRESH_MARGIN_SECONDS > now) return session;
  session = await refreshSession(session);
  return session;
}


export function buildQuery(params = {}) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}
function authHeaders(session, extra = {}) {
  const token = session?.access_token;
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: token ? `Bearer ${token}` : undefined,
    ...extra,
  };
}

export async function rest(path, { method = 'GET', headers = {}, body, auth = true } = {}) {
  const session = auth ? getSessionFromStorage() : null;
  if (auth && !session?.access_token) {
    throw new Error('Supabase session required');
  }
  const mergedHeaders = {
    'Content-Type': body instanceof FormData ? undefined : 'application/json',
    apikey: SUPABASE_ANON_KEY,
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...headers,
  };
  if (mergedHeaders['Content-Type'] === undefined) delete mergedHeaders['Content-Type'];

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: mergedHeaders,
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Supabase REST error ${response.status}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}


export async function restSelect(table, query = {}, options = {}) {
  let qp = '';
  if (typeof query === 'string') qp = query;
  else if (Array.isArray(query)) qp = query.join('&');
  else if (query && typeof query === 'object') qp = buildQuery(query);
  const orderClauses = options.order ? (Array.isArray(options.order) ? options.order : [options.order]) : [];
  if (orderClauses.length) {
    qp += (qp ? '&' : '') + orderClauses.map(o => `order=${encodeURIComponent(o)}`).join('&');
  }
  if (options.limit) {
    qp += (qp ? '&' : '') + `limit=${options.limit}`;
  }
  const path = qp ? `${table}?${qp}` : table;
  return rest(path);
}

export async function restInsert(table, rows, options = {}) {
  try {
    const headers = {
      Prefer: options.returning || 'representation',
    };
    const data = await rest(table, {
      method: 'POST',
      headers,
      body: JSON.stringify(rows),
    });
    return { data, error: null };
  } catch (err) {
    console.warn('[supabase] insert failed', err);
    return { data: null, error: { message: err.message || String(err) } };
  }
}

export async function restUpsert(table, rows, options = {}) {
  try {
    const headers = {
      Prefer: options.returning || 'resolution=merge-duplicates,return=representation',
    };
    const query = options.onConflict ? `${table}?on_conflict=${encodeURIComponent(options.onConflict)}` : table;
    const data = await rest(query, {
      method: 'POST',
      headers,
      body: JSON.stringify(rows),
    });
    return { data, error: null };
  } catch (err) {
    console.warn('[supabase] upsert failed', err);
    return { data: null, error: { message: err.message || String(err) } };
  }
}

export async function restDelete(table, query) {
  try {
    const data = await rest(`${table}?${query}`, { method: 'DELETE' });
    return { data, error: null };
  } catch (err) {
    console.warn('[supabase] delete failed', err);
    return { data: null, error: { message: err.message || String(err) } };
  }
}

function encodeValue(value) {
  if (value === null || value === undefined) return 'null';
  return encodeURIComponent(value);
}

function buildFilter(key, operator, value) {
  return `${encodeURIComponent(key)}=${operator}.${encodeValue(value)}`;
}

class RestQuery {
  constructor(table, mutation = null) {
    this.table = table;
    this.columns = '*';
    this.filters = [];
    this.orders = [];
    this.limitValue = null;
    this.singleMode = null;
    this.mutation = mutation; // { type: 'update' | 'delete', values }
    this.onConflict = null;
  }

  select(columns = '*') { this.columns = columns || '*'; return this; }
  eq(column, value) { this.filters.push(buildFilter(column, 'eq', value)); return this; }
  gte(column, value) { this.filters.push(buildFilter(column, 'gte', value)); return this; }
  lte(column, value) { this.filters.push(buildFilter(column, 'lte', value)); return this; }
  order(column, { ascending = true } = {}) {
    this.orders.push(`${encodeURIComponent(column)}.${ascending ? 'asc' : 'desc'}`);
    return this;
  }
  limit(count) { this.limitValue = count; return this; }
  throwOnError() { this.throwErrors = true; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this._execute(); }
  single() { this.singleMode = 'single'; return this._execute(); }
  onConflictColumns(cols) { this.onConflict = cols; return this; }

  async insert(rows, options = {}) {
    const { data } = await restInsert(this.table, rows, options);
    return { data, error: null };
  }

  upsert(rows, options = {}) {
    this.mutation = { type: 'upsert', rows, options };
    return this;
  }

  update(values) {
    this.mutation = { type: 'update', values };
    return this;
  }

  delete() {
    this.mutation = { type: 'delete' };
    return this;
  }

  async _executeSelect() {
    const params = [`select=${encodeURIComponent(this.columns || '*')}`];
    if (this.filters.length) params.push(...this.filters);
    if (this.orders.length) params.push(...this.orders.map(o => `order=${o}`));
    if (this.limitValue != null) params.push(`limit=${this.limitValue}`);
    const query = params.join('&');
    try {
      const rows = await rest(`${this.table}?${query}`);
      if (this.singleMode === 'single') {
        const row = rows?.[0] || null;
        if (!row) return { data: null, error: { message: 'No rows', code: 'PGRST116' } };
        return { data: row, error: null };
      }
      if (this.singleMode === 'maybe') {
        return { data: rows?.[0] || null, error: null };
      }
      return { data: rows || [], error: null };
    } catch (err) {
      if (this.throwErrors) throw err;
      return { data: null, error: { message: err.message || String(err) } };
    }
  }

  async _executeMutation() {
    const query = this.filters.join('&');
    if (this.mutation.type === 'update') {
      const { values } = this.mutation;
      const data = await rest(`${this.table}?${query}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(values),
      });
      return { data: Array.isArray(data) ? data : [data], error: null };
    }
    if (this.mutation.type === 'delete') {
      try {
        const data = await rest(`${this.table}?${query}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=representation' },
        });
        return { data: Array.isArray(data) ? data : [data], error: null };
      } catch (err) {
        if (this.throwErrors) throw err;
        return { data: null, error: { message: err.message || String(err) } };
      }
    }
    if (this.mutation.type === 'upsert') {
      const { rows, options = {} } = this.mutation;
      const queryPart = query ? `${this.table}?${query}` : this.table;
      const conflict = options.onConflict ? `on_conflict=${encodeURIComponent(options.onConflict)}` : '';
      const qs = [query, conflict].filter(Boolean).join('&');
      try {
        const data = await rest(`${this.table}${qs ? '?' + qs : ''}`, {
          method: 'POST',
          headers: { Prefer: options.returning || 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
        });
        return { data: Array.isArray(data) ? data : [data], error: null };
      } catch (err) {
        if (this.throwErrors) throw err;
        return { data: null, error: { message: err.message || String(err) } };
      }
    }
    return { data: null, error: { message: 'Unsupported mutation', code: 'UNSUPPORTED' } };
  }

  async _execute() {
    if (this.mutation) {
      return this._executeMutation();
    }
    return this._executeSelect();
  }

  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }

  catch(reject) {
    return this._execute().catch(reject);
  }
}

class StorageBucket {
  constructor(bucket) {
    this.bucket = bucket;
  }

  async upload(path, file, { upsert = false, contentType } = {}) {
    const session = await ensureSession();
    if (!session?.access_token) {
      return { data: null, error: { message: 'Supabase session missing' } };
    }
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'x-upsert': upsert ? 'true' : 'false',
    };
    if (contentType) headers['Content-Type'] = contentType;
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${this.bucket}/${path}`, {
      method: 'POST',
      headers,
      body: file,
    });
    if (!response.ok) {
      return { data: null, error: { message: await response.text() } };
    }
    return { data: { path }, error: null };
  }

  getPublicUrl(path) {
    return {
      data: {
        publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${this.bucket}/${path}`,
      },
      error: null,
    };
  }

  async createSignedUrl(path, expiresIn) {
    const session = await ensureSession();
    if (!session?.access_token) {
      return { data: null, error: { message: 'Supabase session missing' } };
    }
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${this.bucket}/${path}`, {
      method: 'POST',
      headers: {
        ...JSON_HEADERS,
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ expiresIn }),
    });
    const text = await res.text();
    if (!res.ok) return { data: null, error: { message: text } };
    const data = text ? JSON.parse(text) : null;
    return { data, error: null };
  }
}

function makeAuthResponse(session, user) {
  return { data: { session, user }, error: null };
}

export const supabase = {
  auth: {
    async getSession() {
      return { data: { session: getSessionFromStorage() }, error: null };
    },
    async getUser() {
      const session = getSessionFromStorage();
      return { data: { user: session?.user ?? null }, error: null };
    },
    async signOut() {
      const session = getSessionFromStorage();
      if (session?.access_token) {
        try {
          await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
            method: 'POST',
            headers: {
              ...JSON_HEADERS,
              ...authHeaders(session),
            },
            body: JSON.stringify({ scope: 'global' }),
          });
        } catch (err) {
          console.warn('[supabase] logout failed', err);
        }
      }
      clearSavedSession();
      return { error: null };
    },
    async signInWithPassword({ email, password }) {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          ...JSON_HEADERS,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
      });
      const text = await response.text();
      if (!response.ok) return { data: null, error: { message: text || 'Sign in failed' } };
      const payload = text ? JSON.parse(text) : {};
      if (payload.session) saveSession(payload.session);
      return makeAuthResponse(payload.session, payload.user);
    },
    async signUp({ email, password }) {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          ...JSON_HEADERS,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
      });
      const text = await response.text();
      if (!response.ok) return { data: null, error: { message: text || 'Sign up failed' } };
      const payload = text ? JSON.parse(text) : {};
      if (payload.session) saveSession(payload.session);
      return makeAuthResponse(payload.session, payload.user);
    },
    async resetPasswordForEmail(email, options = {}) {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          ...JSON_HEADERS,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, ...options }),
      });
      if (!response.ok) {
        return { error: { message: await response.text() || 'Reset password failed' } };
      }
      return { error: null };
    },
  },
  from(table) {
    return new RestQuery(table);
  },
  storage: {
    from(bucket) {
      return new StorageBucket(bucket);
    },
  },
  channel() {
    console.warn('[supabase] realtime channels are not supported in REST shim.');
    return {
      subscribe() {
        return { unsubscribe() {} };
      },
    };
  },
  removeChannel() {
    // no-op in REST shim
  },
};


if (typeof window !== 'undefined') {
  window.supabase = supabase;
  window.STAR_SUPABASE = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    getSessionFromStorage,
    saveSession,
    clearSavedSession,
  };
}
