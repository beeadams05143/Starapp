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
  const isDocsFamilyPage = (() => {
    const path = window.location.pathname || '';
    return path.startsWith('/documents/')
      || path === '/emergency-medical.html'
      || path === '/focus-week.html';
  })();

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
        background:${isDocsFamilyPage ? '#fffdfa' : '#fff'};
        box-shadow:0 10px 28px rgba(0,0,0,.22);
        transform:translateX(-100%);
        transition:transform .25s ease;
        z-index:5001;                  /* stay above bottom tabs */
        overflow-y:auto;
        overflow-x:hidden;
        -webkit-overflow-scrolling:touch;
        padding-bottom: calc(var(--bottombar-h) + 24px); /* last items never hide */
        font-size:17px;
        font-family:"Avenir Next","Segoe UI","Helvetica Neue",Arial,sans-serif;
        border-right:1px solid rgba(212, 180, 104, .28);
      }
      #drawerOverlay[aria-hidden="false"] nav.drawer{ transform:translateX(0); }

      nav.drawer header{
        font-weight:700;
        padding:16px 18px;
        border-bottom:1px solid ${isDocsFamilyPage ? 'rgba(212, 180, 104, .22)' : '#eee'};
        font-size:19px;
        letter-spacing:.01em;
        color:${isDocsFamilyPage ? '#6f4518' : '#111'};
      }
      nav.drawer .drawer-item{
        display:block; padding:10px 16px;
      }
      nav.drawer .drawer-item a{
        display:flex; align-items:center; gap:12px;
        text-decoration:none; color:#1f2937; font-weight:600; font-size:17px;
        line-height:1.25;
      }
      nav.drawer .mode-toggle{
        display:flex; gap:10px; padding:14px 16px; border-bottom:1px solid #f1f5f9;
      }
      nav.drawer .mode-btn{
        flex:1; border:1px solid #d8dee8; background:#fff; color:#334155;
        border-radius:999px; padding:11px 12px; font-weight:600; cursor:pointer;
        font-size:16px;
        font-family:inherit;
      }
      nav.drawer .mode-btn.active{
        background:${isDocsFamilyPage ? '#8a6b44' : '#0f172a'}; color:#fff; border-color:${isDocsFamilyPage ? '#8a6b44' : '#0f172a'};
      }
      nav.drawer details{ padding:8px 14px; }
      nav.drawer details > *:not(summary){ display:block; }
      nav.drawer details>summary{
        cursor:pointer;
        font-weight:600;
        list-style:none;
        font-size:17px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        color:#1f2937;
      }
      nav.drawer details>summary::-webkit-details-marker{ display:none; }
      nav.drawer details>summary::after{
        content:'▾';
        font-size:20px;
        line-height:1;
        color:${isDocsFamilyPage ? '#8a6b44' : '#64748b'};
        transition:transform .22s ease;
        margin-left:auto;
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
        margin:8px 0 10px;
        color:#64748b;
        font-size:13px;
        line-height:1.45;
        font-weight:500;
      }
      nav.drawer .sub{
        overflow:hidden;
      }
      nav.drawer .sub a{
        display:flex;
        align-items:center;
        gap:12px;
        padding:10px 12px;
        border-radius:12px;
        text-decoration:none; color:#334155; font-size:15px;
        font-weight:500;
      }
      nav.drawer .sub a:hover{ background:${isDocsFamilyPage ? 'rgba(246, 232, 200, .5)' : '#f1f5f9'}; }
      nav.drawer .nav-icon{
        display:inline-grid;
        place-items:center;
        width:28px;
        min-width:28px;
        font-size:27px;
        line-height:1;
      }
      nav.drawer .nav-text{
        flex:1;
      }
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
        <a href="/profile.html"><span class="nav-icon">👤</span><span class="nav-text">Profile</span></a>
      </div>
      <details data-role="caregiver">
        <summary><span class="nav-icon">⚙️</span><span class="nav-text">Settings & Admin</span></summary>
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
        <a href="/dashboard.html"><span class="nav-icon">🏠</span><span class="nav-text">Dashboard</span></a>
      </div>
      <div class="drawer-item" data-role="shared">
        <a id="auth-dash-link" href="/login.html"><span class="nav-icon">🔐</span><span class="nav-text">Log In</span></a>
      </div>
      <div class="drawer-item" data-role="individual">
        <a href="/home.html"><span class="nav-icon">😊</span><span class="nav-text">Mood Check-In</span></a>
      </div>
      <div class="drawer-item" data-role="individual">
        <a href="/wouldyourather.html"><span class="nav-icon">🤔</span><span class="nav-text">Would You Rather</span></a>
      </div>
      <div class="drawer-item" data-role="individual">
        <a href="/my-star-voice.html"><span class="nav-icon">🗣️</span><span class="nav-text">My STAR Voice</span></a>
      </div>
      <div class="drawer-item" data-role="caregiver">
        <a href="/caregiver-checkin.html"><span class="nav-icon">👥</span><span class="nav-text">Caregiver Check-In</span></a>
      </div>
      <div class="drawer-item" data-role="caregiver">
        <a href="/caregiver-report.html"><span class="nav-icon">📊</span><span class="nav-text">Caregiver Report</span></a>
      </div>
      <div class="drawer-item" data-role="shared">
        <a href="/chat.html"><span class="nav-icon">💬</span><span class="nav-text">Group Chat</span></a>
      </div>
      <div class="drawer-item" data-role="shared">
        <a href="/calendar.html"><span class="nav-icon">📅</span><span class="nav-text">Calendar</span></a>
      </div>
      <div class="drawer-item" data-role="caregiver">
        <a href="/focus-week.html"><span class="nav-icon">⭐</span><span class="nav-text">Focus of the Week</span></a>
      </div>
      <details data-role="caregiver">
        <summary><span class="nav-icon">📂</span><span class="nav-text">Documents</span></summary>
        <div class="detail-body">
          <div class="detail-body-inner">
            <div class="helper">Access important records, ISA/IEP plans, meeting notes, medical details, finance, caregiving, HR, year end paperwork, guardianship, and uploaded files.</div>
            <div class="sub">
              <a href="/emergency-medical.html">Emergency Sheet</a>
              <a href="/documents/documents.html?cat=ISA">ISA / IEP</a>
              <a href="/documents/minutes-form.html">Meeting Minutes</a>
              <a href="/documents/documents.html?cat=Medical">Medical</a>
              <a href="/documents/documents.html?cat=Caregiving">Caregiving</a>
              <a href="/documents/documents.html?cat=HR">HR</a>
              <a href="/documents/documents.html?cat=Finance">Finance</a>
              <a href="/documents/documents.html?cat=Year%20End%20Paperwork">Year End Paperwork</a>
              <a href="/documents/documents.html?cat=Guardianship">Guardianship</a>
              <a href="/documents/documents.html?cat=Uploaded%20Files">Uploaded Files</a>
            </div>
          </div>
        </div>
      </details>
      <div class="drawer-item" data-role="shared">
        <a href="/emergency-medical.html"><span class="nav-icon">🚨</span><span class="nav-text">Emergency</span></a>
      </div>
    </nav>
  `;

  // put the overlay into the page
  document.body.appendChild(overlay);

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
    const textEl = el.querySelector('.nav-text');
    if (session?.user) {
      if (textEl) textEl.textContent = 'Log Out';
      el.setAttribute('href', '#logout');
    } else {
      if (textEl) textEl.textContent = 'Log In';
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
