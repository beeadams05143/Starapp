import { checkinDateKey, normalizeCheckinDate } from './caregiver-dates.js';

// Read-only, group-scoped queries. A complete response is required to assert absence.
export async function loadCalendarCheckins({ request, groupId, startDate, endDate, reportRows = [] }) {
  if (!groupId) return { rows: [], complete: false, unresolved: 0, legacy: 0 };
  async function fetchPages(filters) {
    const rows = [];
    const size = 1000;
    for (let offset = 0; ; offset += size) {
      const page = await request(`caregiver_checkins?select=id,group_id,user_id,created_at,submitted_at,date,had_bm,payload&group_id=eq.${encodeURIComponent(groupId)}&${filters}order=id.asc&limit=${size}&offset=${offset}`);
      if (!Array.isArray(page)) throw new Error('Invalid calendar response');
      rows.push(...page);
      if (page.length < size) return rows;
    }
  }
  let rows = [], complete = false;
  try {
    rows = await fetchPages(`date=gte.${startDate}&date=lt.${endDate}&`);
    // Null-date records must be fetched independently of the month date-column filter.
    rows.push(...await fetchPages('date=is.null&'));
    complete = true;
  } catch {
    // A fresh, independently scoped query can recover either failed request above.
    try {
      rows = await fetchPages('');
      complete = true;
    } catch { /* Known report rows remain useful, but cannot prove absence. */ }
  }
  const unique = new Map();
  for (const row of [...rows, ...reportRows]) {
    if (String(row?.group_id || '') !== String(groupId)) continue;
    const identity = row.id || JSON.stringify(row);
    if (!unique.has(identity)) unique.set(identity, row);
  }
  let unresolved = 0, legacy = 0;
  const matching = [];
  for (const row of unique.values()) {
    const key = checkinDateKey(row);
    if (!key) { unresolved++; continue; }
    if (key < startDate || key >= endDate) continue;
    const legacyDate = !normalizeCheckinDate(row.date) || row.date !== key;
    if (legacyDate) legacy++;
    matching.push({ ...row, date: key, calendarLegacyDate: legacyDate });
  }
  return { rows: matching, complete, unresolved, legacy };
}

export function calendarEmptyLabel(state, key, todayKey, hasCheckin) {
  if (hasCheckin || key > todayKey) return '—';
  if (!state.complete) return 'Check-ins could not be fully loaded';
  if (state.unresolved) return 'Check-in date needs review';
  return 'No check-in recorded';
}
