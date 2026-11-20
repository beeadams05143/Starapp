function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function startFor(range, now) {
  if (range === 'day') return localDateKey(now);
  if (range === 'month') return localDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
  if (range === 'year') return localDateKey(new Date(now.getFullYear(), 0, 1));
  if (range === '6months') return localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 183));
  return '';
}

export async function fetchMoodReportRows(rest, { groupId, individualId, userId, range, now = new Date() }) {
  if (!groupId || !individualId || !userId) return [];
  const start = startFor(range, now);
  const params = new URLSearchParams({
    select: 'id,group_id,user_id,date,created_at,mood,notes,note',
    group_id: 'eq.' + groupId,
    user_id: 'eq.' + individualId,
    order: 'date.desc,created_at.desc,id.desc',
    limit: '500',
  });
  if (start) params.append('date', 'gte.' + start);
  params.append('date', 'lte.' + localDateKey(now));

  const rows = new Map();
  for (let offset = 0; ; offset += 500) {
    params.set('offset', String(offset));
    const page = await rest('mood_entries?' + params, { expectedUserId: userId });
    if (!Array.isArray(page)) throw new Error('Could not read mood check-ins.');
    for (const row of page) {
      if (row.group_id !== groupId || row.user_id !== individualId || !row.id) continue;
      const date = row.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || (start && date < start) || date > localDateKey(now)) continue;
      const dateObj = new Date(date + 'T00:00:00');
      if (!Number.isFinite(dateObj.getTime())) continue;
      rows.set(row.id, {
        id: row.id, date, dateObj, timestamp: row.created_at || date,
        mood: String(row.mood || '').trim() || 'Unknown',
        notes: row.notes || row.note || '',
      });
    }
    if (page.length < 500) return [...rows.values()].reverse();
  }
}
