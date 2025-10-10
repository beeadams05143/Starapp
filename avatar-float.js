// avatar-float.js — floating Group Settings avatar (DISABLED by default)

(() => {
  // Toggle this to true if you ever want the floating avatar back.
  const ENABLED = false;

  if (!ENABLED) return; // no-op

  // Where to navigate if re-enabled (point to profile, not group settings)
  const DEST = '/profile.html';
  const DEFAULT_AVATAR = '/IMG/default-avatar.png';

  // Per-page opt-out: <body class="hide-avatar">
  if (document.body.classList.contains('hide-avatar')) return;

  // Styles
  const css = `
    .floating-avatar {
      position: fixed;
      right: 16px;
      width: 44px; height: 44px;
      border-radius: 50%;
      border: 3px solid #fff;
      box-shadow: 0 6px 18px rgba(0,0,0,.18);
      overflow: hidden;
      z-index: 1200;
      background: #fff;
      cursor: pointer;
      user-select: none;
    }
    .floating-avatar img { width: 100%; height: 100%; display: block; object-fit: cover; }
    @media (max-width: 480px) { .floating-avatar { width: 40px; height: 40px; right: 12px; } }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // Element
  const wrap = document.createElement('button');
  wrap.type = 'button';
  wrap.className = 'floating-avatar';
  wrap.id = 'avatar-float'; // for CSS failsafe targeting
  wrap.setAttribute('aria-label', 'Open profile');

  const img = document.createElement('img');
  img.alt = 'Avatar';

  const getAvatarUrl = () => localStorage.getItem('avatarUrl') || DEFAULT_AVATAR;
  const applyAvatar = () => { const url = getAvatarUrl(); if (img.src !== url) img.src = url; };
  img.addEventListener('error', () => { img.src = DEFAULT_AVATAR; }, { once: true });

  wrap.appendChild(img);
  document.body.appendChild(wrap);

  // Navigate to profile (not group settings)
  wrap.addEventListener('click', () => { window.location.href = DEST; });

  // Place below top app bar
  function placeBelowAppBar() {
    const appbar = document.querySelector('[data-appbar]') ||
                   document.querySelector('.appbar') ||
                   document.querySelector('header');
    const h = appbar ? appbar.getBoundingClientRect().height : 56;
    wrap.style.top = `${Math.max(8, Math.round(h + 8))}px`;
  }

  // React to avatar changes
  window.addEventListener('avatar:updated', applyAvatar);
  window.addEventListener('storage', (e) => { if (e.key === 'avatarUrl') applyAvatar(); });

  // Init
  applyAvatar();
  placeBelowAppBar();
  window.addEventListener('load', placeBelowAppBar);
  window.addEventListener('resize', placeBelowAppBar);
  setTimeout(placeBelowAppBar, 120);
})();
