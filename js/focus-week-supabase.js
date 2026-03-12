// js/focus-week-supabase.js
// Syncs Focus of the Week to Supabase (weekly_plans) and uploads attachments to a private bucket.
// Requires: restClient.js & supabaseClient constants

import {
  rest,
  getSessionFromStorage,
} from '../restClient.js?v=2025.01.09E';
import { ensureActiveGroupId } from '../active-group.js?v=2026.03.12A';

// ---------- helpers ----------
function isoDateOnly(d = new Date()) {
  // return YYYY-MM-DD in local time
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}
function mondayFromISO(iso) {
  const d = new Date(iso);
  const day = d.getDay();            // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return isoDateOnly(d);
}
function getWeekStartISO() {
  const el = document.getElementById('weekStartPicker');
  const chosen = el?.value || isoDateOnly();
  return mondayFromISO(chosen); // table has a CHECK that week_start is Monday
}
function getLocalPayloadKey() {
  const session = getSessionFromStorage();
  const userId = session?.user?.id || null;
  const groupId = localStorage.getItem('currentGroupId') || null;
  if (!userId || !groupId) return null;
  return `focusOfWeek_v1:${userId}:${groupId}`;
}
function readLocalPayload() {
  const key = getLocalPayloadKey();
  if (!key) return null;
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

// ---------- DB ----------
async function upsertWeeklyPlan(payload, attachmentPaths = []) {
  const session = getSessionFromStorage();
  const user = session?.user;
  if (!user) return;
  const groupId = await ensureActiveGroupId(user.id);
  if (!groupId) return;
  const nowIso = new Date().toISOString();

  const latest = await rest([
    'weekly_plans?select=id',
    `group_id=eq.${encodeURIComponent(groupId)}`,
    'order=updated_at.desc.nullslast',
    'order=created_at.desc.nullslast',
    'limit=1'
  ].join('&'));

  const record = {
    user_id: user.id,
    group_id: groupId,
    week_start: getWeekStartISO(),
    focus_area: payload.focusArea || null,
    custom_title: payload.customTitle || null,
    why_matters: payload.whyMatters || null,
    goals_json: payload.goals || [],
    days_json: payload.days || [],
    reflection: payload.reflection || null,
    next_steps: payload.nextSteps || null,
    created_at: nowIso,
    updated_at: nowIso
  };

  try {
    const existingId = latest?.[0]?.id || null;
    if (existingId) {
      await rest(`weekly_plans?id=eq.${encodeURIComponent(existingId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ ...record, created_at: undefined }),
      });
    } else {
      await rest('weekly_plans', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([record]),
      });
    }
  } catch (error) {
    console.error('Supabase upsert error:', error);
  }
}

async function loadWeeklyPlan() {
  const session = getSessionFromStorage();
  const user = session?.user;
  if (!user) return null;
  const groupId = await ensureActiveGroupId(user.id);
  if (!groupId) return null;

  try {
    const rows = await rest([
      'weekly_plans?select=*',
      `group_id=eq.${encodeURIComponent(groupId)}`,
      'order=updated_at.desc.nullslast',
      'order=created_at.desc.nullslast',
      'limit=1'
    ].join('&'));
    return rows?.[0] || null;
  } catch (error) {
    console.error('Supabase load error:', error);
    return null;
  }
}

// ---------- Wire into page ----------
window.addEventListener('DOMContentLoaded', async () => {
  const weekStartEl = document.getElementById('weekStartPicker');

  // Patch page save() to also sync with Supabase + upload files
  const originalSave = window.save;
  window.save = async function () {
    if (typeof originalSave === 'function') originalSave(); // writes localStorage

    const payload = readLocalPayload();
    const session = getSessionFromStorage();
    const user = session?.user;
    if (!user || !payload) return;
    await upsertWeeklyPlan(payload);
  };

  // Hydrate from Supabase when week changes or on first load
  async function hydrate() {
    const row = await loadWeeklyPlan();
    if (row) {
      const merged = {
        focusArea: row.focus_area,
        customTitle: row.custom_title,
        whyMatters: row.why_matters,
        weekStart: row.week_start,
        goals: row.goals_json,
        days: row.days_json,
        reflection: row.reflection,
        nextSteps: row.next_steps,
        savedAt: new Date().toISOString()
      };
      const key = getLocalPayloadKey();
      if (key) localStorage.setItem(key, JSON.stringify(merged));
      if (typeof window.load === 'function') window.load();
    }
  }

  weekStartEl?.addEventListener('change', hydrate);
  await hydrate();
});
