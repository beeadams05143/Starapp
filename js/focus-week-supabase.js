// js/focus-week-supabase.js
// Syncs Focus of the Week to Supabase (weekly_plans) and uploads attachments to a private bucket.
// Requires: supabaseClient.js exporting `export const supabase = createClient(...)`
// Bucket name assumed: 'weekly-plan-attachments'

import { supabase } from '../supabaseClient.js?v=2025.10.15f';

const LS_KEY = 'focusOfWeek_v1';
const BUCKET = 'weekly-plan-attachments';

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
  const el = document.getElementById('weekStart');
  const chosen = el?.value || isoDateOnly();
  return mondayFromISO(chosen); // table has a CHECK that week_start is Monday
}
function readLocalPayload() {
  const raw = localStorage.getItem(LS_KEY);
  return raw ? JSON.parse(raw) : null;
}

// ---------- DB ----------
async function upsertWeeklyPlan(payload, attachmentPaths = []) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const upsert = {
    user_id: user.id,
    week_start: getWeekStartISO(),
    person_name: payload.personName || null,
    goal_type: payload.goalType || null,
    focus_area: payload.focusArea || null,
    custom_title: payload.customTitle || null,
    why_matters: payload.whyMatters || null,
    goals_json: payload.goals || [],
    days_json: payload.days || [],
    reflection: payload.reflection || null,
    next_steps: payload.nextSteps || null,
    signature: payload.signature || null,
    attachments_urls: attachmentPaths.length ? attachmentPaths : (payload.attachments_urls || []),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('weekly_plans')
    .upsert(upsert, { onConflict: 'user_id,week_start' });

  if (error) console.error('Supabase upsert error:', error);
}

async function loadWeeklyPlan(weekStartISO) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('weekly_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('week_start', weekStartISO)
    .maybeSingle();

  if (error) { console.error('Supabase load error:', error); return null; }
  return data;
}

// ---------- Storage ----------
async function uploadAttachments(files, userId, weekISO) {
  if (!files || !files.length) return [];
  const uploaded = [];
  for (const file of files) {
    const path = `${userId}/${weekISO}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false
    });
    if (error) { console.error('Upload error:', error, file.name); continue; }
    uploaded.push(path);
  }
  return uploaded;
}
async function getSignedUrls(paths) {
  if (!paths?.length) return [];
  const out = [];
  for (const p of paths) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(p, 60 * 60 * 24 * 7); // 7 days
    if (!error && data?.signedUrl) out.push({ path: p, url: data.signedUrl });
  }
  return out;
}
function renderAttachmentLinks(list) {
  const id = 'attachmentsList';
  let container = document.getElementById(id);
  if (!container) {
    container = document.createElement('div');
    container.id = id;
    const input = document.getElementById('attachments');
    input?.parentElement?.appendChild(container);
  }
  container.innerHTML = '';
  if (!list?.length) return;
  const ul = document.createElement('ul');
  ul.style.marginTop = '8px';
  for (const { path, url } of list) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = path.split('/').slice(-1)[0];
    li.appendChild(a);
    ul.appendChild(li);
  }
  container.appendChild(ul);
}

// ---------- Wire into page ----------
window.addEventListener('DOMContentLoaded', async () => {
  const weekStartEl = document.getElementById('weekStart');
  const attachmentsEl = document.getElementById('attachments');

  // Patch page save() to also sync with Supabase + upload files
  const originalSave = window.save;
  window.save = async function () {
    if (typeof originalSave === 'function') originalSave(); // writes localStorage

    const payload = readLocalPayload();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !payload) return;

    let newPaths = [];
    if (attachmentsEl?.files?.length) {
      newPaths = await uploadAttachments(attachmentsEl.files, user.id, getWeekStartISO());
    }
    const mergedPaths = [...(payload.attachments_urls || []), ...newPaths];

    await upsertWeeklyPlan({ ...payload, attachments_urls: mergedPaths }, mergedPaths);

    const links = await getSignedUrls(mergedPaths);
    renderAttachmentLinks(links);
  };

  // Hydrate from Supabase when week changes or on first load
  async function hydrate() {
    const row = await loadWeeklyPlan(getWeekStartISO());
    if (row) {
      const merged = {
        personName: row.person_name,
        goalType: row.goal_type,
        focusArea: row.focus_area,
        customTitle: row.custom_title,
        whyMatters: row.why_matters,
        weekStart: row.week_start,
        goals: row.goals_json,
        days: row.days_json,
        reflection: row.reflection,
        nextSteps: row.next_steps,
        signature: row.signature,
        attachments_urls: row.attachments_urls || [],
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(LS_KEY, JSON.stringify(merged));
      if (typeof window.load === 'function') window.load();
      const links = await getSignedUrls(merged.attachments_urls);
      renderAttachmentLinks(links);
    } else {
      renderAttachmentLinks([]);
    }
  }

  weekStartEl?.addEventListener('change', hydrate);
  await hydrate();
});
