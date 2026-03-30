// /scripts/appbar-drawer.js — hamburger drawer that hooks to #openMenu
(function () {
  const supaGlobals = window.STAR_SUPABASE || {};
  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    getSessionFromStorage,
    clearSavedSession,
  } = supaGlobals;
  const APP_CONFIG_KEY = 'star_app_config';
  const ONBOARDING_STATUS_KEY = 'star_onboarding_status_v1';
  const LOGIN_URL = '/login.html';
  const INACTIVITY_WARNING_DELAY_MS = 14 * 60 * 1000; // Production: show warning after 14 minutes of inactivity
  const INACTIVITY_LOGOUT_TIMEOUT_MS = 15 * 60 * 1000; // Production: log out after 15 minutes total inactivity
  const WARNING_COUNTDOWN_SECONDS = 60;

  let inactivityWarningTimeout = null;
  let inactivityLogoutTimeout = null;
  let warningCountdownInterval = null;
  let warningCountdownRemaining = WARNING_COUNTDOWN_SECONDS;

  function ensureInactivityWarningStyles() {
    if (document.getElementById('inactivity-warning-css')) return;

    const style = document.createElement('style');
    style.id = 'inactivity-warning-css';
    style.textContent = `
      #inactivityWarningBanner {
        position: fixed;
        left: 50%;
        bottom: calc(var(--tabbar-h, 56px) + 20px);
        transform: translateX(-50%);
        z-index: 6000;
        width: min(520px, calc(100vw - 32px));
        background: #fff7ed;
        color: #7c2d12;
        border: 1px solid #fdba74;
        border-radius: 14px;
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.18);
        padding: 14px 16px;
        font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      }

      #inactivityWarningBanner[hidden] {
        display: none;
      }

      .inactivity-warning__title {
        font-size: 16px;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .inactivity-warning__countdown {
        font-size: 14px;
        font-weight: 600;
      }
    `;
    document.head.appendChild(style);
  }

  function getInactivityWarningBanner() {
    let banner = document.getElementById('inactivityWarningBanner');
    if (banner) return banner;

    ensureInactivityWarningStyles();

    banner = document.createElement('div');
    banner.id = 'inactivityWarningBanner';
    banner.hidden = true;
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    banner.innerHTML = `
      <div class="inactivity-warning__title">You will be logged out in 60 seconds due to inactivity</div>
      <div class="inactivity-warning__countdown">60 seconds remaining</div>
    `;
    document.body.appendChild(banner);
    return banner;
  }

  function updateWarningCountdownText() {
    const banner = document.getElementById('inactivityWarningBanner');
    if (!banner) return;

    const title = banner.querySelector('.inactivity-warning__title');
    const countdown = banner.querySelector('.inactivity-warning__countdown');
    if (title) {
      title.textContent = 'You will be logged out in 60 seconds due to inactivity';
    }
    if (countdown) {
      countdown.textContent = `${warningCountdownRemaining} seconds remaining`;
    }
  }

  function hideInactivityWarning() {
    const banner = document.getElementById('inactivityWarningBanner');
    if (banner) banner.hidden = true;
  }

  function clearWarningCountdownInterval() {
    if (warningCountdownInterval) {
      clearInterval(warningCountdownInterval);
      warningCountdownInterval = null;
    }
  }

  function clearInactivityTimers() {
    if (inactivityWarningTimeout) {
      clearTimeout(inactivityWarningTimeout);
      inactivityWarningTimeout = null;
    }
    if (inactivityLogoutTimeout) {
      clearTimeout(inactivityLogoutTimeout);
      inactivityLogoutTimeout = null;
    }
    clearWarningCountdownInterval();
    warningCountdownRemaining = WARNING_COUNTDOWN_SECONDS;
    hideInactivityWarning();
  }

  function showInactivityWarning() {
    const banner = getInactivityWarningBanner();
    warningCountdownRemaining = WARNING_COUNTDOWN_SECONDS;
    updateWarningCountdownText();
    banner.hidden = false;

    clearWarningCountdownInterval();
    warningCountdownInterval = window.setInterval(() => {
      warningCountdownRemaining -= 1;

      if (warningCountdownRemaining <= 0) {
        clearWarningCountdownInterval();
        warningCountdownRemaining = 0;
      }

      updateWarningCountdownText();
    }, 1000);
  }

  function clearLocalIdentityState() {
    const keys = ['user_id', 'currentGroupId', 'currentGroupName'];
    for (const key of keys) {
      try { localStorage.removeItem(key); } catch {}
    }
  }

  async function performProtectedLogout() {
    clearInactivityTimers();

    try {
      if (window.supabase?.auth?.signOut) {
        await window.supabase.auth.signOut();
      } else {
        const session = typeof getSessionFromStorage === 'function' ? getSessionFromStorage() : null;
        if (session?.access_token && SUPABASE_URL) {
          await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
            method: 'POST',
            headers: buildAuthHeaders(session.access_token),
            body: JSON.stringify({ scope: 'global' }),
          });
        }
        if (typeof clearSavedSession === 'function') clearSavedSession();
      }
    } catch (err) {
      console.warn('[drawer] logout request failed', err);
      if (typeof clearSavedSession === 'function') clearSavedSession();
    }

    clearLocalIdentityState();
    window.location.href = LOGIN_URL;
  }

  function resetInactivityLogoutTimer() {
    const session = typeof getSessionFromStorage === 'function' ? getSessionFromStorage() : null;
    if (!session?.user?.id) {
      clearInactivityTimers();
      return;
    }

    clearInactivityTimers();

    inactivityWarningTimeout = window.setTimeout(() => {
      showInactivityWarning();
    }, INACTIVITY_WARNING_DELAY_MS);
    inactivityLogoutTimeout = window.setTimeout(() => {
      performProtectedLogout();
    }, INACTIVITY_LOGOUT_TIMEOUT_MS);
  }

  function setupInactivityAutoLogout() {
    if (window.__STAR_INACTIVITY_LOGOUT_BOUND__) return;
    window.__STAR_INACTIVITY_LOGOUT_BOUND__ = true;

    window.addEventListener('mousemove', resetInactivityLogoutTimer, { passive: true });
    window.addEventListener('click', resetInactivityLogoutTimer, { passive: true });
    window.addEventListener('keydown', resetInactivityLogoutTimer);

    resetInactivityLogoutTimer();
  }

  function readStoredJson(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function readOnboardingCompletion() {
    const store = readStoredJson(ONBOARDING_STATUS_KEY);
    return store?.complete === true;
  }

  function isAllowedOnboardingPath() {
    const path = window.location.pathname || '';
    const onboardingActive = new URLSearchParams(window.location.search).get('onboarding') === '1';
    if (path === '/onboarding.html') return true;
    if (path === '/profile.html') return true;
    if (path === '/feature-setup.html') return true;
    if (path === '/caregiver-setup-wizard.html') return true;
    if (!onboardingActive) return false;
    return [
      '/caregiver-checkin.html',
      '/focus-week.html',
      '/caregiver-report.html',
    ].includes(path);
  }

  async function enforceOnboardingGate() {
    const session = typeof getSessionFromStorage === 'function' ? getSessionFromStorage() : null;
    if (!session?.user?.id) return;
    if (isAllowedOnboardingPath()) return;
    if (!readOnboardingCompletion()) {
      window.location.replace('/onboarding.html');
    }
  }
  // If we've already injected, don't do it again
  if (document.getElementById('drawerOverlay')) return;
  enforceOnboardingGate();
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
              <a href="/caregiver-setup-wizard.html" data-caregiver-edit-link>Edit Caregiver Check-In</a>
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
        <a href="/chat.html" data-feature="chat"><span class="nav-icon">💬</span><span class="nav-text">Group Chat</span></a>
      </div>
      <div class="drawer-item" data-role="shared">
        <a href="/calendar.html" data-feature="calendar"><span class="nav-icon">📅</span><span class="nav-text">Calendar</span></a>
      </div>
      <div class="drawer-item" data-role="caregiver">
        <a href="/focus-week.html" data-feature="focus"><span class="nav-icon">⭐</span><span class="nav-text">Focus of the Week</span></a>
      </div>
      <details data-role="caregiver" data-feature="documents">
        <summary><span class="nav-icon">📂</span><span class="nav-text">Documents</span></summary>
        <div class="detail-body">
          <div class="detail-body-inner">
            <div class="helper">Access important records, ISA/IEP plans, meeting notes, medical details, finance, caregiving, HR, year end paperwork, guardianship, and uploaded files.</div>
            <div class="sub">
              <a href="/emergency-medical.html" data-doc-type="emergency">Emergency Sheet</a>
              <a href="/documents/documents.html?cat=ISA" data-doc-type="isa_iep">ISA / IEP</a>
              <a href="/documents/minutes-form.html" data-doc-type="isa_iep">Meeting Minutes</a>
              <a href="/documents/documents.html?cat=Medical" data-doc-type="medical">Medical</a>
              <a href="/documents/documents.html?cat=Caregiving" data-doc-type="caregiving">Caregiving</a>
              <a href="/documents/documents.html?cat=HR" data-doc-type="hr_finance">HR</a>
              <a href="/documents/documents.html?cat=Finance" data-doc-type="hr_finance">Finance</a>
              <a href="/documents/documents.html?cat=Year%20End%20Paperwork" data-doc-type="year_end">Year End Paperwork</a>
              <a href="/documents/documents.html?cat=Guardianship" data-doc-type="guardianship">Guardianship</a>
              <a href="/documents/documents.html?cat=Uploaded%20Files" data-doc-type="uploaded_files">Uploaded Files</a>
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

  function hasCompletedCaregiverSetup() {
    try {
      const parsed = JSON.parse(localStorage.getItem('caregiver_config') || 'null');
      if (!parsed || typeof parsed !== 'object') return false;
      return [
        'show_daily_living',
        'show_behavior',
        'show_movement',
        'show_health',
        'show_menstrual',
        'show_community',
        'show_vocational',
        'show_educational',
        'daily_living',
        'behavior_fields',
        'health_fields',
      ].some((key) => key in parsed);
    } catch {
      return false;
    }
  }

  function getAppConfig() {
    try {
      const parsed = JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || 'null');
      return {
        appFeatures: {
          chat: parsed?.appFeatures?.chat !== false,
          calendar: parsed?.appFeatures?.calendar !== false,
          focus: parsed?.appFeatures?.focus !== false,
          documents: parsed?.appFeatures?.documents !== false,
        },
        documentTypes: Array.isArray(parsed?.documentTypes) && parsed.documentTypes.length
          ? parsed.documentTypes
          : ['emergency', 'isa_iep', 'medical', 'hr_finance', 'guardianship', 'year_end', 'uploaded_files', 'caregiving'],
      };
    } catch {
      return {
        appFeatures: { chat: true, calendar: true, focus: true, documents: true },
        documentTypes: ['emergency', 'isa_iep', 'medical', 'hr_finance', 'guardianship', 'year_end', 'uploaded_files', 'caregiving'],
      };
    }
  }

  function applyFeatureVisibility(role) {
    const config = getAppConfig();
    overlay.querySelectorAll('[data-feature]').forEach((node) => {
      const feature = node.dataset.feature;
      const featureEnabled = feature ? config.appFeatures[feature] !== false : true;
      if (!featureEnabled) node.style.display = 'none';
    });
    overlay.querySelectorAll('[data-doc-type]').forEach((node) => {
      node.style.display = config.documentTypes.includes(node.dataset.docType) ? '' : 'none';
    });
    const documentsDetails = overlay.querySelector('details[data-feature="documents"]');
    if (documentsDetails && documentsDetails.style.display !== 'none') {
      const visibleDocLinks = Array.from(documentsDetails.querySelectorAll('[data-doc-type]')).some((node) => node.style.display !== 'none');
      documentsDetails.style.display = visibleDocLinks ? '' : 'none';
    }
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

    const editLink = overlay.querySelector('[data-caregiver-edit-link]');
    if (editLink) {
      editLink.style.display = hasCompletedCaregiverSetup() ? '' : 'none';
    }
  }
  updateAuthLink();
  window.addEventListener('storage', () => {
    updateAuthLink();
    applyFeatureVisibility(storedMode === 'caregiver' ? 'caregiver' : 'individual');
    resetInactivityLogoutTimer();
  });
  setupInactivityAutoLogout();

  const MODE_KEY = 'star_menu_mode';
  let storedMode = 'caregiver';
  function applyMenuMode(mode){
    const role = mode === 'caregiver' ? 'caregiver' : 'individual';
    storedMode = role;
    try { localStorage.setItem(MODE_KEY, role); } catch {}
    overlay.querySelectorAll('[data-role-btn]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.roleBtn === role);
    });
    overlay.querySelectorAll('[data-role]').forEach(node => {
      const roles = (node.dataset.role || '').split(/\s+/).filter(Boolean);
      node.style.display = (roles.includes('shared') || roles.includes(role)) ? '' : 'none';
    });
    applyFeatureVisibility(role);
  }
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
      close();
      await performProtectedLogout();
      return;
    }

    // For normal links just close the drawer; navigation proceeds
    close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();
