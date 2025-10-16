// /scripts/appbar-drawer.js — hamburger drawer that hooks to #openMenu
(function () {
  const supaGlobals = window.STAR_SUPABASE || {};
  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    getSessionFromStorage,
    clearSavedSession,
  } = supaGlobals;
  // If we've already injected, don't do it again
  if (document.getElementById('drawerOverlay')) return;

  // --- inject drawer CSS once ---
  if (!document.getElementById('drawer-css')) {
    const s = document.createElement('style');
    s.id = 'drawer-css';
    s.textContent = `
      :root{ --appbar-h:56px; --bottombar-h:72px; }

      /* overlay behind the drawer */
      #drawerOverlay{
        position:fixed; inset:var(--appbar-h) 0 0 0;
        background:rgba(0,0,0,.22);
        display:none;
        z-index:5000; /* above page & bottom tabs */
      }
      #drawerOverlay[aria-hidden="false"]{ display:block; }

      /* left drawer panel */
      nav.drawer{
        position:fixed; top:var(--appbar-h); bottom:0; left:0;
        width:320px; max-width:86vw;
        background:#fff;
        box-shadow:0 10px 28px rgba(0,0,0,.22);
        transform:translateX(-100%);
        transition:transform .25s ease;
        z-index:5001;                  /* stay above bottom tabs */
        overflow-y:auto;
        overflow-x:hidden;
        -webkit-overflow-scrolling:touch;
        padding-bottom: calc(var(--bottombar-h) + 24px); /* last items never hide */
      }
      #drawerOverlay[aria-hidden="false"] nav.drawer{ transform:translateX(0); }

      nav.drawer header{
        font-weight:800; padding:14px 16px; border-bottom:1px solid #eee;
      }
      nav.drawer details{ padding:8px 12px; }
      nav.drawer details>summary{ cursor:pointer; font-weight:700; list-style:none; }
      nav.drawer .sub a{
        display:block; padding:8px 10px; border-radius:10px;
        text-decoration:none; color:#111;
      }
      nav.drawer .sub a:hover{ background:#f1f5f9; }
    `;
    document.head.appendChild(s);
  }

  // --- create overlay element for drawer ---
  const overlay = document.createElement('div');
  overlay.id = 'drawerOverlay';
  overlay.setAttribute('aria-hidden','true');

  // --- drawer HTML (cleaned + Activities added) ---
  overlay.innerHTML = `
    <nav class="drawer" id="appDrawer" aria-label="Main">
      <header>Menu</header>

      <!-- PROFILE -->
      <details open>
        <summary>👤 Profile</summary>
        <div class="sub"><a href="/profile.html">View / Edit Profile</a></div>
      </details>

      <!-- HOME -->
      <details open>
        <summary>🏠 Home</summary>
        <div class="sub">
          <a href="/home.html">Home</a>
          <a href="/dashboard.html">Home / Dashboard</a>
        </div>
      </details>

      <!-- DASHBOARD (dynamic: Log In / Log Out) -->
      <details open>
        <summary>📊 Dashboard</summary>
        <div class="sub">
          <a href="/dashboard.html">Dashboard</a>
          <a id="auth-dash-link" href="/login.html">Log In</a>
        </div>
      </details>

      <!-- CHECK INS -->
      <details open>
        <summary>📝 Check Ins</summary>
        <div class="sub">
          <a href="/home.html">😊 Individual</a>
          <a href="/caregiver-checkin.html">👥 Caregiver</a>
        </div>
      </details>

      <!-- ACTIVITIES -->
      <details open>
        <summary>🎯 Activities</summary>
        <div class="sub">
          <a href="/wouldyourather.html">🤔 Would You Rather</a>
        </div>
      </details>

      <!-- REPORTS -->
      <details open>
        <summary>📈 Reports</summary>
        <div class="sub">
          <a href="/mood-report.html">🙂 Mood Report</a>
          <a href="/caregiver-report.html">📊 Caregiver Report</a>
        </div>
      </details>

      <!-- GROUP CHAT -->
      <details open>
        <summary>💬 Group Chat</summary>
        <div class="sub"><a href="/chat.html">Open Chat</a></div>
      </details>

      <!-- CALENDAR -->
      <details open>
        <summary>📅 Calendar</summary>
        <div class="sub"><a href="/calendar.html">Calendar</a></div>
      </details>

      <!-- FOCUS OF THE WEEK -->
      <details open>
        <summary>⭐ Focus of the Week</summary>
        <div class="sub"><a href="/focus-week.html">Weekly Focus</a></div>
      </details>

      <!-- DOCUMENTS -->
      <details>
        <summary>📂 Documents</summary>
        <div class="sub">
          <a href="/documents/minutes-form.html">📝 Meeting Minutes</a>
          <a href="/documents/finance.html">💵 Finance</a>
          <a href="/documents/medical.html">🩺 Medical</a>
          <a href="/documents/hr.html">🏢 HR</a>
          <a href="/documents/caregiving.html">🧩 Caregiving</a>
          <a href="/documents/isa-iep.html">📚 ISA/IEP</a>
          <a href="/documents/year-end-paperwork.html">📦 Year End Paperwork</a>
          <a href="/documents/guardianship.html">🛡 Guardianship</a>
        </div>
      </details>

      <!-- EMERGENCY -->
      <details>
        <summary>🚨 Emergency</summary>
        <div class="sub"><a href="/emergency-medical.html">Emergency Info</a></div>
      </details>
    </nav>
  `;

  // put the overlay into the page
  document.body.appendChild(overlay);

  // --- auth toggle for Log In / Log Out inside the drawer ---
  function buildAuthHeaders(token) {
    if (!SUPABASE_ANON_KEY) return { 'Content-Type': 'application/json' };
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function updateAuthLink() {
    const el = overlay.querySelector('#auth-dash-link');
    if (!el) return;
    const session = typeof getSessionFromStorage === 'function' ? getSessionFromStorage() : null;
    if (session?.user) {
      el.textContent = 'Log Out';
      el.setAttribute('href', '#logout');
    } else {
      el.textContent = 'Log In';
      el.setAttribute('href', '/login.html');
    }
  }
  updateAuthLink();
  window.addEventListener('storage', updateAuthLink);

  // --- open / close helpers ---
  const open  = () => { overlay.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; };
  const close = () => { overlay.setAttribute('aria-hidden','true');  document.body.style.overflow=''; };

  // bind to the button created by your top appbar (#openMenu)
  function bindOpen(){
    const btn = document.getElementById('openMenu');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', (e)=>{ e.preventDefault(); open(); });
    }
  }
  bindOpen();
  new MutationObserver(bindOpen).observe(document.documentElement, { childList:true, subtree:true });

  // close on overlay click / ESC / any link inside the drawer
  overlay.addEventListener('click', async (e) => {
    if (e.target === overlay) { close(); return; }

    const a = e.target.closest('a');
    if (!a) return;

    // Handle logout click
    if (a.id === 'auth-dash-link' && a.getAttribute('href') === '#logout') {
      e.preventDefault();
      const session = typeof getSessionFromStorage === 'function' ? getSessionFromStorage() : null;
      if (session?.access_token && SUPABASE_URL) {
        try {
          await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
            method: 'POST',
            headers: buildAuthHeaders(session.access_token),
            body: JSON.stringify({ scope: 'global' }),
          });
        } catch (err) {
          console.warn('[drawer] logout request failed', err);
        }
      }
      if (typeof clearSavedSession === 'function') clearSavedSession();
      close();
      location.href = '/login.html';
      return;
    }

    // For normal links just close the drawer; navigation proceeds
    close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();
