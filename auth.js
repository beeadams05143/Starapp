// auth.js — REST-based auth helpers
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  saveSession,
  clearSavedSession,
  getSessionFromStorage,
} from './supabaseClient.js?v=2025.01.09E';

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

async function postAuth(path, body, { withToken = false } = {}) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
  if (withToken) {
    const session = getSessionFromStorage();
    if (!session?.access_token) throw new Error('No active session');
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = json?.error_description || json?.error || json?.message || text || 'Auth request failed';
    throw new Error(message);
  }
  const session = normalizeSession(json);
  if (session) saveSession(session);
  return json;
}
// Centralized URLs (use your real paths)
const DASHBOARD_URL = 'dashboard.html';
const LOGIN_URL = 'login.html';
const SIGNUP_URL = 'signup.html';

/* Expose functions to buttons */
window.signUp = signUp;
window.logIn  = logIn;
window.logOut = logOut;

/* ------------- SIGN UP ------------- */
async function signUp() {
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;
  const msg = document.getElementById('message');

  try {
    const data = await postAuth('/auth/v1/signup', { email, password });
    const session = getSessionFromStorage();
    const user = session?.user || data?.user || null;
    if (user?.id) {
      try { localStorage.setItem('user_id', user.id); } catch {}
    }
    if (session?.access_token) {
      window.location.assign(DASHBOARD_URL);
    } else if (msg) {
      msg.textContent = 'Check your email to confirm!';
    }
  } catch (error) {
    if (msg) msg.textContent = error.message;
    return;
  }
}

/* -------------- LOG IN -------------- */
async function logIn() {
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;
  const msg = document.getElementById('message');

  if (!email || !password) {
    if (msg) msg.textContent = 'Enter email and password.';
    return;
  }

  try {
    setAuthBusy(true);
    if (msg) msg.textContent = '';

    await postAuth('/auth/v1/token?grant_type=password', { email, password });
    const session = getSessionFromStorage();
    const user = session?.user;
    if (user?.id) {
      try { localStorage.setItem('user_id', user.id); } catch {}
      window.location.assign(DASHBOARD_URL);
    } else if (msg) {
      msg.textContent = 'Signed in, but no user session returned. Try again.';
      return;
    }
  } catch (err) {
    console.error('[AUTH] unexpected signIn error', err);
    if (msg) msg.textContent = 'Unexpected login error. Please retry.';
  } finally {
    setAuthBusy(false);
  }
}

function setAuthBusy(on) {
  const buttons = [
    document.getElementById('loginBtn'),
    document.getElementById('signupBtn'),
    document.getElementById('forgotBtn'),
    document.getElementById('logoutBtn')
  ].filter(Boolean);
  buttons.forEach(btn => (btn.disabled = on));
}

/* ------------- LOG OUT -------------- */
async function logOut() {
  try {
    await postAuth('/auth/v1/logout', { scope: 'global' }, { withToken: true });
  } catch (err) {
    console.warn('[AUTH] signOut error', err);
  }
  try {
    localStorage.clear();
  } catch {}
  clearSavedSession();
  window.location.assign(LOGIN_URL);
}

/* --------- ROUTE / SESSION GUARDS --------- */
const sessionGuard = () => {
  const session = getSessionFromStorage();
  const path = window.location.pathname.toLowerCase();

  const onLogin  = path.endsWith('/login.html');
  const onSignup = path.endsWith('/signup.html');
  const onDash   = path.endsWith('/dashboard.html');

  // If on dashboard but not authenticated → go to login
  if (!session && onDash) {
    window.location.href = 'login.html';
    return;
  }

  // If already authenticated and on login/signup → go to dashboard
  if (session && (onLogin || onSignup)) {
    window.location.href = 'dashboard.html';
    return;
  }

  // Optional: show email anywhere that has #user-email
  if (session) {
    const el = document.getElementById('user-email');
    if (el) el.textContent = `Logged in as: ${session.user.email}`;
  }
};

sessionGuard();
window.addEventListener('storage', sessionGuard);
