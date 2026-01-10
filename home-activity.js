import { rest, getSessionFromStorage } from './restClient.js?v=2025.01.09E';
import { downloadJsonFromBucket } from './shared-storage.js?v=2025.01.09E';

let host = null;

function boot(){
  host = document.getElementById('activityBannerHost');
  if (!host) return;

  // show placeholder immediately so users see "All caught up" before data loads
  renderPlaceholder([]);
  const session = getSessionFromStorage();
  const currentUser = session?.user;
  if (!currentUser?.id) return;

  const USER_ID = currentUser.id;
  const GROUP_KEY = 'currentGroupId';
  const SEEN_KEY = `homeActivitySeen:v2:${USER_ID}`;
  const SHARED_BUCKET = 'documents';
  const DOCS_PREFIX = 'shared/docs';
  const EMERGENCY_PREFIX = 'shared/emergency';
  const HEALTH_STAMP_KEY = 'healthCalendarLastSavedAt';

  const seenMap = readSeenMap();

  const SOURCES = [
    {
      key: 'caregiver',
      label: 'Caregiver check-in',
      query: () => 'caregiver_checkins?select=updated_at,submitted_at,created_at&order=updated_at.desc.nullslast&order=created_at.desc.nullslast&limit=1',
      fields: ['updated_at', 'submitted_at', 'created_at'],
      detail: (row) => row?.submitted_at || row?.created_at || null,
    },
    {
      key: 'chat',
      label: 'Chat message',
      query: (gid) => gid ? `messages?select=created_at,message&group_id=eq.${encodeURIComponent(gid)}&order=created_at.desc&limit=1` : null,
      fields: ['created_at'],
      detail: (row) => row?.message || null,
    },
    {
      key: 'calendar',
      label: 'Calendar update',
      query: (gid) => gid ? [
        'calendar_events?select=updated_at,created_at,title',
        `group_id=eq.${encodeURIComponent(gid)}`,
        'type=not.eq.health-flag',
        'order=updated_at.desc.nullslast',
        'order=created_at.desc.nullslast',
        'limit=1',
      ].join('&') : null,
      fields: ['updated_at', 'created_at'],
      detail: (row) => row?.title || null,
    },
    {
      key: 'behavior',
      label: 'Health calendar note',
      query: (gid) => gid ? [
        'calendar_events?select=updated_at,created_at,title',
        `group_id=eq.${encodeURIComponent(gid)}`,
        'type=eq.health-flag',
        'order=updated_at.desc.nullslast',
        'order=created_at.desc.nullslast',
        'limit=1',
      ].join('&') : null,
      fields: ['updated_at', 'created_at'],
      detail: (row) => row?.title || null,
    },
    {
      key: 'mood',
      label: 'Mood check-in',
      query: (gid) => gid
        ? `mood_entries?select=updated_at,created_at,mood&group_id=eq.${encodeURIComponent(gid)}&order=updated_at.desc.nullslast&order=created_at.desc.nullslast&limit=1`
        : 'mood_entries?select=updated_at,created_at,mood&order=updated_at.desc.nullslast&limit=1',
      fields: ['updated_at', 'created_at'],
      detail: (row) => row?.mood || null,
    },
    {
      key: 'documentsDb',
      label: 'Document saved',
      query: () => 'documents?select=updated_at,created_at,title&order=updated_at.desc.nullslast&limit=1',
      fields: ['updated_at', 'created_at'],
      detail: (row) => row?.title || null,
    },
    {
      key: 'emergencyDb',
      label: 'Emergency info update',
      query: (gid) => gid
        ? `emergency_medical?select=updated_at,id&group_id=eq.${encodeURIComponent(gid)}&order=updated_at.desc&limit=1`
        : 'emergency_medical?select=updated_at,id&order=updated_at.desc&limit=1',
      fields: ['updated_at'],
      detail: () => null,
    },
  ];

  const STORAGE_SOURCES = [
    {
      key: 'documentsShared',
      label: 'Shared document library',
      path: (gid) => gid ? `${DOCS_PREFIX}/${gid}.json` : null,
    },
    {
      key: 'emergencyShared',
      label: 'Shared emergency sheet',
      path: (gid) => gid ? `${EMERGENCY_PREFIX}/${gid}.json` : null,
    },
  ];

  const LOCAL_SOURCES = [
    { key: 'healthLocal', label: 'Health calendar note', storageKey: HEALTH_STAMP_KEY },
  ];

  init().catch((err) => console.warn('home activity init failed', err));

  async function init() {
    const groupId = await ensureGroupId(USER_ID, GROUP_KEY);
    if (!groupId) {
      renderPlaceholder([]);
      return;
    }
    const summary = await fetchActivitySummary(groupId);
    const unseen = summary.updates.filter((entry) => entry.ts && entry.label && entry.ts > (seenMap[entry.key] || 0));
    if (!unseen.length) {
      renderPlaceholder(summary.updates || []);
      return;
    }
    renderBanners(unseen);
  }

  function renderPlaceholder(updates){
    host.innerHTML = '';
    host.classList.remove('is-hidden');
    const latestTs = updates.reduce((max, entry) => Math.max(max, entry.ts || 0), 0);
    const when = latestTs ? new Date(latestTs).toLocaleString() : 'No updates yet';
    const card = document.createElement('article');
    card.className = 'activity-banner';
    const copy = document.createElement('div');
    copy.className = 'banner-copy';
    copy.innerHTML = `<strong>All caught up</strong><span>We&rsquo;ll alert you when something new happens.<br><small>Last activity: ${when}</small></span>`;
    card.appendChild(copy);
    host.appendChild(card);
  }

  function renderBanners(entries) {
    host.innerHTML = '';
    host.classList.remove('is-hidden');
    const sorted = entries.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    sorted.forEach((entry) => {
      const card = document.createElement('article');
      card.className = 'activity-banner';

      const copy = document.createElement('div');
      copy.className = 'banner-copy';
      copy.innerHTML = `<strong>${entry.label}</strong><span>${formatEntry(entry)}</span>`;

      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.setAttribute('aria-label', `Dismiss ${entry.label} update`);
      dismiss.textContent = '✕';
      dismiss.addEventListener('click', () => dismissEntry(entry, card));

      card.append(copy, dismiss);
      host.appendChild(card);
    });
  }

  function formatEntry(entry) {
    const detail = entry.detail ? `${entry.detail} • ` : '';
    const when = entry.ts ? new Date(entry.ts).toLocaleString() : '';
    return `${detail}${when || 'Just now'}`;
  }

  function dismissEntry(entry, card) {
    seenMap[entry.key] = entry.ts;
    saveSeenMap();
    card.remove();
    if (!host.children.length) {
      host.classList.add('is-hidden');
    }
  }

  async function fetchActivitySummary(groupId) {
    const dbResults = await Promise.all(SOURCES.map((source) => fetchSourceTimestamp(source, groupId)));
    const storageResults = await Promise.all(STORAGE_SOURCES.map((source) => fetchStorageTimestamp(source, groupId)));
    const localResults = LOCAL_SOURCES.map(readLocalTimestamp);
    const combined = mergeByKey([...dbResults, ...storageResults, ...localResults]);
    const updates = combined.filter((entry) => entry && entry.ts);
    return { updates };
  }

  async function fetchSourceTimestamp(source, groupId) {
    const query = typeof source.query === 'function' ? source.query(groupId) : source.query;
    if (!query) return { key: source.key, label: source.label, ts: 0, detail: null };
    return runQuery({ ...source, query });
  }

  async function fetchStorageTimestamp(source, groupId) {
    const path = typeof source.path === 'function' ? source.path(groupId) : source.path;
    if (!path) return { key: source.key, label: source.label, ts: 0, detail: null };
    try {
      const data = await downloadJsonFromBucket(SHARED_BUCKET, path);
      if (!data) return { key: source.key, label: source.label, ts: 0, detail: null };
      const stamp = data.updated_at || data.updatedAt;
      const ts = stamp ? Date.parse(stamp) : 0;
      const detail = data?.documents?.[0]?.title || null;
      return { key: source.key, label: source.label, ts: Number.isFinite(ts) ? ts : 0, detail };
    } catch (error) {
      console.warn(`activity storage fetch failed (${source.key})`, error?.message || error);
      return { key: source.key, label: source.label, ts: 0, detail: null };
    }
  }

  function readLocalTimestamp(source) {
    if (!source.storageKey) return { key: source.key, label: source.label, ts: 0, detail: null };
    let ts = 0;
    try { ts = Number(localStorage.getItem(source.storageKey) || 0); } catch { ts = 0; }
    if (!Number.isFinite(ts)) ts = 0;
    return { key: source.key, label: source.label, ts, detail: null };
  }

  async function runQuery({ key, label, query, fields = ['updated_at', 'created_at'], detail }) {
    try {
      const rows = await rest(query);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return { key, label, ts: 0, detail: null };
      const ts = extractTimestamp(row, fields);
      const detailText = typeof detail === 'function' ? detail(row) : null;
      return { key, label, ts, detail: detailText };
    } catch (error) {
      console.warn(`activity fetch failed (${key})`, error?.message || error);
      return { key, label, ts: 0, detail: null };
    }
  }

  function extractTimestamp(row, fields) {
    for (const field of fields) {
      const value = row?.[field];
      if (!value) continue;
      const ts = Date.parse(value);
      if (Number.isFinite(ts)) return ts;
    }
    return 0;
  }

  function mergeByKey(entries) {
    const map = new Map();
    for (const entry of entries) {
      if (!entry) continue;
      const prev = map.get(entry.key);
      if (!prev || (entry.ts || 0) > (prev.ts || 0)) {
        map.set(entry.key, entry);
      }
    }
    return [...map.values()];
  }

  async function ensureGroupId(userId, storageKey) {
    if (!userId) return null;
    let cached = null;
    try { cached = localStorage.getItem(storageKey); } catch { cached = null; }
    if (cached) return cached;
    try {
      const rows = await rest([
        'group_members?select=group_id',
        `user_id=eq.${encodeURIComponent(userId)}`,
        'order=joined_at.asc',
        'limit=1',
      ].join('&'));
      const gid = rows?.[0]?.group_id || null;
      if (gid) {
        try { localStorage.setItem(storageKey, gid); } catch {}
      }
      return gid;
    } catch (error) {
      console.warn('home activity group lookup failed', error?.message || error);
      return null;
    }
  }

  function readSeenMap() {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveSeenMap() {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(seenMap));
    } catch {}
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
