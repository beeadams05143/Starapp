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
        font-size:16px;
      }
      #drawerOverlay[aria-hidden="false"] nav.drawer{ transform:translateX(0); }

      nav.drawer header{
        font-weight:800; padding:14px 16px; border-bottom:1px solid #eee; font-size:18px;
      }
      nav.drawer .drawer-item{
        display:block; padding:10px 14px;
      }
      nav.drawer .drawer-item a{
        display:flex; align-items:center; gap:8px;
        text-decoration:none; color:#111; font-weight:800; font-size:16px;
      }
      nav.drawer .mode-toggle{
        display:flex; gap:8px; padding:12px 14px; border-bottom:1px solid #f1f5f9;
      }
      nav.drawer .mode-btn{
        flex:1; border:1px solid #e2e8f0; background:#f8fafc; color:#0f172a;
        border-radius:999px; padding:8px 10px; font-weight:800; cursor:pointer;
      }
      nav.drawer .mode-btn.active{
        background:#0f172a; color:#fff; border-color:#0f172a;
      }
      nav.drawer details{ padding:6px 12px; }
      nav.drawer details > *:not(summary){ display:block; }
      nav.drawer details>summary{
        cursor:pointer;
        font-weight:800;
        list-style:none;
        font-size:16px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
      }
      nav.drawer details>summary::-webkit-details-marker{ display:none; }
      nav.drawer details>summary::after{
        content:'▾';
        font-size:13px;
        color:#64748b;
        transition:transform .22s ease;
      }
      nav.drawer details[open]>summary::after{ transform:rotate(180deg); }
      nav.drawer .detail-body{
        display:grid;
        grid-template-rows:0fr;
        opacity:0;
        transition:grid-template-rows .22s ease, opacity .18s ease;
      }
      nav.drawer details[open] .detail-body{
        grid-template-rows:1fr;
        opacity:1;
      }
      nav.drawer .detail-body-inner{
        overflow:hidden;
        padding-top:6px;
      }
      nav.drawer .helper{
        margin:6px 0 8px;
        color:#64748b;
        font-size:12px;
        line-height:1.35;
        font-weight:500;
      }
      nav.drawer .sub{
        overflow:hidden;
      }
      nav.drawer .sub a{
        display:block; padding:9px 10px; border-radius:10px;
        text-decoration:none; color:#111; font-size:15px;
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
      <div class="mode-toggle" role="group" aria-label="Menu mode">
        <button type="button" class="mode-btn" data-role-btn="individual">Individual (Me)</button>
        <button type="button" class="mode-btn" data-role-btn="caregiver">Caregiver</button>
      </div>

      <div class="drawer-item" data-role="shared">
        <a href="/profile.html">👤 Profile</a>
      </div>
      <details data-role="shared">
        <summary>⚙️ Settings & Admin</summary>
        <div class="detail-body">
          <div class="detail-body-inner">
            <div class="sub">
              <a href="/group-settings.html">Group Settings</a>
              <a href="/caregiver-checkin-setup/">Custom Caregiver Check-In Setup</a>
            </div>
          </div>
        </div>
      </details>
      <div class="drawer-item" data-role="shared">
        <a href="/dashboard.html">🏠 Dashboard</a>
      </div>
      <div class="drawer-item" data-role="shared">
        <a id="auth-dash-link" href="/login.html">Log In</a>
      </div>
      <div class="drawer-item" data-role="individual">
        <a href="/home.html">😊 Mood Check-In</a>
      </div>
      <div class="drawer-item" data-role="individual">
        <a href="/wouldyourather.html">🤔 Would You Rather</a>
      </div>
      <div class="drawer-item" data-role="individual">
        <a href="/my-star-voice.html">🗣️ My STAR Voice</a>
      </div>
      <div class="drawer-item" data-role="caregiver">
        <a href="/caregiver-checkin.html">👥 Caregiver Check-In</a>
      </div>
      <div class="drawer-item" data-role="caregiver">
        <a href="/caregiver-report.html">📊 Caregiver Report</a>
      </div>
      <div class="drawer-item" data-role="shared">
        <a href="/chat.html">💬 Group Chat</a>
      </div>
      <div class="drawer-item" data-role="shared">
        <a href="/calendar.html">📅 Calendar</a>
      </div>
      <div class="drawer-item" data-role="caregiver">
        <a href="/focus-week.html">⭐ Focus of the Week</a>
      </div>
      <details data-role="caregiver shared">
        <summary>📂 Documents</summary>
        <div class="detail-body">
          <div class="detail-body-inner">
            <div class="helper">Access important records, ISA/IEP plans, meeting notes, medication info, and uploaded files.</div>
            <div class="sub">
              <a href="/emergency-medical.html">Emergency Sheet</a>
              <a href="/documents/isa-iep.html">ISA / IEP</a>
              <a href="/documents/meeting-minutes.html">Meeting Minutes</a>
              <a href="/documents/medications.html">Medications</a>
              <a href="/documents/files.html">Uploaded Files</a>
            </div>
          </div>
        </div>
      </details>
      <div class="drawer-item" data-role="shared">
        <a href="/emergency-medical.html">🚨 Emergency</a>
      </div>
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

  const MODE_KEY = 'star_menu_mode';
  function applyMenuMode(mode){
    const role = mode === 'caregiver' ? 'caregiver' : 'individual';
    try { localStorage.setItem(MODE_KEY, role); } catch {}
    overlay.querySelectorAll('[data-role-btn]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.roleBtn === role);
    });
    overlay.querySelectorAll('[data-role]').forEach(node => {
      const roles = (node.dataset.role || '').split(/\s+/).filter(Boolean);
      node.style.display = (roles.includes('shared') || roles.includes(role)) ? '' : 'none';
    });
  }
  let storedMode = 'caregiver';
  try { storedMode = localStorage.getItem(MODE_KEY) || storedMode; } catch {}
  if (storedMode !== 'caregiver' && storedMode !== 'individual') storedMode = 'caregiver';
  applyMenuMode(storedMode);
  // --- open / close helpers ---
  const open  = () => { overlay.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; };
  const close = () => { overlay.setAttribute('aria-hidden','true');  document.body.style.overflow=''; };

  overlay.querySelectorAll('[data-role-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      applyMenuMode(btn.dataset.roleBtn);
      close();
      location.href = '/dashboard.html';
    });
  });

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
