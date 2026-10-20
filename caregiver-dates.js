// Calendar dates are civil dates, never submission timestamps or instants.
export function normalizeCheckinDate(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T\d{2}:\d{2})/);
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!iso && !us) return '';
  const [year, month, day] = iso ? iso.slice(1, 4).map(Number) : [Number(us[3]), Number(us[1]), Number(us[2])];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function checkinDateKey(row = {}) {
  for (const value of [row?.date, row?.payload?.entry_date, row?.payload?.date, row?.payload?.shiftDate]) {
    const key = normalizeCheckinDate(value);
    if (key) return key;
  }
  return '';
}

export function formatCheckinDate(value, locale, options = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const key = normalizeCheckinDate(value);
  if (!key) return value || '';
  // UTC is used only as a formatting container, with the formatter pinned to UTC.
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: 'UTC' });
}
