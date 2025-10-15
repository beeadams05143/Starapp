// auth.js
import { supabase } from './supabaseClient.js?v=2025.10.14a';
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

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (msg) msg.textContent = error.message;
    return;
  }

  // Optional helper: keep user_id locally (Supabase already persists the session)
  if (data?.user) localStorage.setItem('user_id', data.user.id);

  if (data?.session) {
    // Email confirmation NOT required → user is signed in now
    window.location.assign(DASHBOARD_URL);

  } else {
    // Email confirmation required in Supabase settings
    if (msg) msg.textContent = 'Check your email to confirm!';
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

    console.time('[AUTH] signInWithPassword');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    console.timeEnd('[AUTH] signInWithPassword');

    if (error) {
      console.error('[AUTH] signIn error', error);
      if (msg) msg.textContent = error.message || 'Could not sign in.';
      return;
    }

    if (data?.user) {
      localStorage.setItem('user_id', data.user.id);
      window.location.assign(DASHBOARD_URL);
    } else {
      if (msg) msg.textContent = 'Signed in, but no user session returned. Try again.';
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
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('[AUTH] signOut error', err);
  }
  try {
    localStorage.clear();
  } catch {}
  window.location.assign(LOGIN_URL);
}

/* --------- ROUTE / SESSION GUARDS --------- */
supabase.auth.getSession().then(({ data: { session } }) => {
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
});
