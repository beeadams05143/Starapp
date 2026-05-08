/**
 * Resolves router.js from the site root first, then sibling to this module.
 * router.js lives at repo root (same tier as auth.html); not under /scripts/.
 */
export async function loadAndRunRouter() {
  const VERSION = '2026.05.07';
  const candidates = [];

  try {
    const origin = globalThis.location?.origin;
    if (origin && /^https?:\/\//i.test(origin)) {
      candidates.push(`${origin}/router.js?v=${encodeURIComponent(VERSION)}`);
    }
  } catch {
    /* ignore */
  }

  candidates.push(new URL('./router.js', import.meta.url).href);

  /** @type {unknown} */
  let lastErr = null;
  for (const path of candidates) {
    console.log('Loading router from:', path);
    try {
      const mod = await import(path);
      if (mod && typeof mod.next === 'function') {
        await mod.next();
      }
      return;
    } catch (e) {
      lastErr = e;
      console.error('Router failed to load', e);
    }
  }

  console.error('Router failed to load', lastErr);
  window.location.href = 'dashboard.html';
}
