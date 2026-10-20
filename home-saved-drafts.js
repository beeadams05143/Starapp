import { getSessionFromStorage } from './restClient.js?v=2025.01.09E';
import { ensureActiveGroupId } from './active-group.js?v=2026.03.12A';
import { validSelectedDate } from './caregiver-submission.js';
import { formatCheckinDate } from './caregiver-dates.js';

// Browser-local recovery copies only. Server-backed drafts will be added later.
export function listHomeDrafts(storage, userId, groupId) {
  if (!storage || !userId || !groupId) return [];
  const prefix = 'star-checkin-recovery-v2:real:' + userId + ':' + groupId + ':';
  const drafts = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const item = JSON.parse(storage.getItem(key));
      if (!item || item.phase === 'verified') continue;
      const date = item.draft?.data?.[0]?.entry_date;
      drafts.push({
        key, date: validSelectedDate(date) ? date : null,
        updatedAt: item.updatedAt || '',
        pending: !!item.attempt?.sent,
      });
    } catch { /* One damaged recovery copy must not hide other drafts. */ }
  }
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function showHomeDrafts(doc = document, win = window) {
  const host = doc.getElementById('homeSavedDrafts');
  if (!host) return;
  const session = getSessionFromStorage();
  if (!session?.user?.id) return;
  try {
    const groupId = await ensureActiveGroupId(session.user.id);
    if (!groupId) return;
    const drafts = listHomeDrafts(win.localStorage, session.user.id, groupId);
    if (!drafts.length) {
      const empty = doc.createElement('p');
      empty.textContent = 'No saved drafts on this device yet. Start a new check-in and choose Save Draft to see it here.';
      empty.style.cssText = 'padding:18px;background:#fff;border:1px solid #d8d2c8;border-radius:12px;line-height:1.5';
      host.appendChild(empty);
      host.hidden = false;
      return;
    }
    const heading = doc.createElement('h2');
    heading.textContent = 'My Saved Drafts';
    heading.style.cssText = 'font-size:20px;margin:0 0 8px;color:#2c2c2a';
    host.appendChild(heading);
    const info = doc.createElement('p');
    info.textContent = 'Saved on this device · Only drafts from this browser appear here.';
    info.style.cssText = 'font-size:14px;color:#5f5e5a;margin:0 0 12px';
    host.appendChild(info);
    for (const draft of drafts) {
      const link = doc.createElement('a');
      const params = new URLSearchParams({ resumeDraft: draft.key });
      link.href = 'caregiver-checkin.html?' + params.toString();
      link.style.cssText = 'display:block;padding:14px 16px;margin:8px 0;background:#fff;border:1px solid #d8d2c8;border-radius:12px;color:#2c2c2a;text-decoration:none';
      const title = doc.createElement('strong');
      title.textContent = draft.pending ? 'Check save status — do not resubmit' : 'Continue check-in';
      const detail = doc.createElement('div');
      detail.style.cssText = 'margin-top:4px;color:#5f5e5a;font-size:14px';
      detail.textContent = (draft.date ? formatCheckinDate(draft.date, 'en-US', { weekday:'long',month:'long',day:'numeric',year:'numeric' }) : 'Date not selected') +
        ' · Saved ' + (draft.updatedAt ? new Date(draft.updatedAt).toLocaleString() : 'on this device');
      link.append(title, detail);
      host.appendChild(link);
    }
    host.hidden = false;
  } catch (error) {
    console.warn('[home drafts] Cannot display browser recovery copies', error);
  }
}

if (typeof document !== 'undefined') showHomeDrafts();
