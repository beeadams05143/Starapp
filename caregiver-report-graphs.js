const DAY_MS = 86400000;

export function dateInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function defaultGraphRange(today = new Date()) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  start.setMonth(start.getMonth() - 3);
  return {
    start,
    end,
    startInput: dateInputValue(start),
    endInput: dateInputValue(end),
  };
}

export function rangeFromInputs(startInput, endInput) {
  const start = startInput ? new Date(`${startInput}T00:00:00`) : null;
  const end = endInput ? new Date(`${endInput}T23:59:59.999`) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return null;
  }
  return { start, end, startInput, endInput };
}

export function formatGraphRange(range) {
  if (!range?.start || !range?.end) return 'All loaded data';
  const fmt = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(range.start)} to ${fmt(range.end)}`;
}

export function filterRecordsByRange(records = [], range, getDate) {
  if (!range?.start || !range?.end) return records.slice();
  return records.filter((record) => {
    const dt = getDate(record);
    return !!dt && !Number.isNaN(dt.getTime()) && dt >= range.start && dt <= range.end;
  });
}

export function weekStartSunday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function buildWeeklyPromptSeries(entries = [], { getDate, getPrompt }) {
  const buckets = new Map();
  entries.forEach((entry) => {
    const dt = getDate(entry);
    const prompt = getPrompt(entry);
    if (!dt || Number.isNaN(dt.getTime()) || !Number.isFinite(prompt)) return;
    const start = weekStartSunday(dt);
    const key = dateInputValue(start);
    const bucket = buckets.get(key) || { key, weekStart: start, total: 0, count: 0 };
    bucket.total += prompt;
    bucket.count += 1;
    buckets.set(key, bucket);
  });
  return [...buckets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      average: bucket.total / bucket.count,
      count: bucket.count,
    }));
}

