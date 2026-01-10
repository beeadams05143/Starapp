// caregiver-report-supabase.js — PRODUCTION SAFE (client-side filtering)
import { rest, getSessionFromStorage } from './restClient.js?v=2025.01.09E';

/* ---------- shared helpers ---------- */
const TRUE_VALUES = new Set(['true', 't', 'yes', 'y', '1', 'on', 'done', 'complete', 'present']);
const FALSE_VALUES = new Set(['false', 'f', 'no', 'n', '0', 'off', 'absent', 'none']);
const DASH_REGEX = /\u2013/g; // normalize en dash to hyphen

const DURATION_MAP = new Map([
  ['0', 0],
  ['0 min', 0],
  ['0 mins', 0],
  ['0 minutes', 0],
  ['15-30 min', 30],
  ['15–30 min', 30],
  ['15 to 30 min', 30],
  ['30-60 min', 60],
  ['30–60 min', 60],
  ['30 to 60 min', 60],
  ['1-2 hrs', 120],
  ['1–2 hrs', 120],
  ['1 to 2 hrs', 120],
  ['1 hr', 60],
  ['1 hour', 60],
  ['1 hrs', 60],
  ['2 hrs', 120],
  ['2 hours', 120],
  ['2+ hrs', 150],
  ['2+ hours', 150],
  ['2 hrs+', 150],
  ['over 2 hrs', 150],
  ['over 2 hours', 150],
]);

const normTs = (row) => {
  let dateOnly = null;
  if (row?.date) {
    const trimmed = `${row.date}`.trim();
    dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? `${trimmed}T00:00:00`
      : trimmed;
  }
  const raw =
    row?.timestamp ||
    row?.submitted_at ||
    row?.created_at ||
    dateOnly;
  if (!raw) return new Date(NaN);
  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime())) return dt;
  if (row?.date) {
    const fallback = new Date(`${row.date}T00:00:00`);
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }
  return new Date(NaN);
};

const ensurePayload = (row) => {
  const payload = row?.payload;
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
};

const toISODate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
};

const coalesce = (...values) => {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
};

const parseBoolean = (value) => {
  if (value === true || value === false) return value;
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const norm = value.trim().toLowerCase();
    if (!norm) return null;
    if (TRUE_VALUES.has(norm)) return true;
    if (FALSE_VALUES.has(norm)) return false;
  }
  return null;
};

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const minutesFrom = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const key = String(value)
    .replace(DASH_REGEX, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!key) return null;
  if (DURATION_MAP.has(key)) return DURATION_MAP.get(key);

  const rangeMatch = key.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const upper = parseFloat(rangeMatch[2]);
    if (Number.isFinite(upper)) {
      return key.includes('hr') ? Math.round(upper * 60) : Math.round(upper);
    }
  }

  const hoursMatch = key.match(/(\d+(?:\.\d+)?)\s*(?:hr|hour|hrs|hours)\b/);
  if (hoursMatch) return Math.round(parseFloat(hoursMatch[1]) * 60);

  const minutesMatch = key.match(/(\d+(?:\.\d+)?)\s*(?:min|minute|minutes)\b/);
  if (minutesMatch) return Math.round(parseFloat(minutesMatch[1]));

  const numeric = parseFloat(key.replace(/[^0-9.]/g, ''));
  if (Number.isFinite(numeric)) {
    return key.includes('hr') ? Math.round(numeric * 60) : Math.round(numeric);
  }
  return null;
};

const parseArrayField = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
};

const gleanAdlFlag = (payload, substrings) => {
  if (!payload) return null;
  const rawCategory =
    payload.adl_category ||
    payload.adlCategory ||
    payload.daily_living_category ||
    payload.dailyLivingCategory ||
    '';
  const category = String(rawCategory).toLowerCase();
  if (!category) return null;
  return substrings.some((piece) => category.includes(piece)) ? true : false;
};

const buildNotes = (row, payload) => {
  const candidates = [
    row?.caregiver_notes,
    payload?.caregiver_notes,
    payload?.physical_notes,
    payload?.behavior_notes,
    payload?.community_notes,
    payload?.daily_living_notes,
    payload?.notes,
  ];
  const parts = [];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (trimmed && !parts.includes(trimmed)) parts.push(trimmed);
  }
  return parts.length ? parts.join('\n\n') : null;
};

const derivePromptScore = (row, payload) => {
  const candidates = [
    row?.new_skill_score,
    payload?.prompting_level,
    payload?.new_skill_score,
    payload?.prompting,
  ];
  for (const candidate of candidates) {
    const num = numberOrNull(candidate);
    if (num !== null) return num;
  }
  return null;
};

const normalizeSupabaseEntry = (row = {}) => {
  const payload = ensurePayload(row);
  const timestampIso = toISODate(
    row.submitted_at || row.timestamp || row.created_at || row.date
  );
  const createdIso = toISODate(row.created_at) || timestampIso;

  const homeMinutes = minutesFrom(
    payload.home_activity_time ?? payload.home_minutes
  );
  const publicMinutes = minutesFrom(
    payload.public_activity_time ??
    payload.community_minutes ??
    payload.public_minutes
  );
  const vocationalMinutes = minutesFrom(
    row.vocational_time ?? payload.vocational_time ?? payload.vocational_minutes
  );
  const leisureMinutes = minutesFrom(
    payload.leisure_time ??
    payload.leisure_minutes ??
    payload.wouldyourather_minutes ??
    payload.wyr_minutes
  );
  const communityMinutesFromRow = numberOrNull(row.community_time);
  const communityMinutes =
    communityMinutesFromRow !== null
      ? communityMinutesFromRow
      : (() => {
          const total = (homeMinutes ?? 0) + (publicMinutes ?? 0);
          return total > 0 ? total : null;
        })();

  const hygiene = coalesce(
    parseBoolean(row.hygiene),
    parseBoolean(payload.hygiene),
    parseBoolean(payload.hygiene_flag),
    gleanAdlFlag(payload, ['hygiene', 'toilet'])
  );
  const foodPrep = coalesce(
    parseBoolean(row.food_prep),
    parseBoolean(payload.food_prep),
    parseBoolean(payload.prepared_food),
    gleanAdlFlag(payload, ['cook', 'food'])
  );
  const cleanup = coalesce(
    parseBoolean(row.cleanup),
    parseBoolean(payload.cleanup),
    parseBoolean(payload.cleanup_flag),
    gleanAdlFlag(payload, ['clean', 'laundry'])
  );

  const hadBm = coalesce(
    parseBoolean(row.had_bm),
    parseBoolean(payload.had_bm),
    parseBoolean(payload.bm_today),
    parseBoolean(payload.had_bm_today)
  );

  const caregiverNotes = buildNotes(row, payload);
  const promptScore = derivePromptScore(row, payload);
  const uniqueId =
    row.id ??
    row.uuid ??
    row.pk ??
    (timestampIso ? `row-${timestampIso}` : `row-${Date.now()}`);

  const movementPresent = coalesce(
    parseBoolean(row.movement_present),
    parseBoolean(payload.movement_present)
  );
  const movementSeverity = numberOrNull(
    row.movement_severity ?? payload.movement_severity
  );
  const movementMainType = coalesce(
    row.movement_main_type,
    payload.movement_main_type
  );
  const movementTimes = parseArrayField(
    row.movement_times ?? payload.movement_times
  );
  const movementBodyMap = parseArrayField(
    row.movement_body_map ?? payload.movement_body_map
  );
  const movementTriggers = parseArrayField(
    row.movement_triggers ?? payload.movement_triggers
  );

  return {
    ...row,
    id: uniqueId,
    timestamp: timestampIso,
    date: timestampIso ? timestampIso.slice(0, 10) : row.date ?? null,
    created_at: createdIso,
    submitted_at: row.submitted_at ?? timestampIso,
    caregiver_name:
      row.caregiver_name ??
      payload.caregiver_name ??
      payload.caregiver ??
      null,
    caregiver_notes: caregiverNotes,
    group_id: row.group_id ?? payload.group_id ?? payload.group ?? null,
    payload,
    source: 'supabase',
    hygiene,
    food_prep: foodPrep,
    cleanup,
    had_bm: hadBm,
    vocational_time: vocationalMinutes,
    community_time: communityMinutes,
    home_time: homeMinutes,
    public_time: publicMinutes,
    leisure_time: leisureMinutes,
    new_skill_score: promptScore,
    focus_goal_logs: Array.isArray(payload.focus_goal_logs) ? payload.focus_goal_logs : [],
    movement_present: movementPresent,
    movement_main_type: movementMainType,
    movement_severity: movementSeverity,
    movement_times: movementTimes,
    movement_notes: row.movement_notes ?? payload.movement_notes ?? null,
    movement_body_map: movementBodyMap,
    movement_other_text: row.movement_other_text ?? payload.movement_other_text ?? null,
    movement_frequency: row.movement_frequency ?? payload.movement_frequency ?? null,
    movement_triggers: movementTriggers,
    movement_trigger_other: row.movement_trigger_other ?? payload.movement_trigger_other ?? null,
    movement_interfered: row.movement_interfered ?? payload.movement_interfered ?? null,
    movement_interfered_notes: row.movement_interfered_notes ?? payload.movement_interfered_notes ?? null,
    movement_awareness: row.movement_awareness ?? payload.movement_awareness ?? null,
    movement_safety_risk: row.movement_safety_risk ?? payload.movement_safety_risk ?? null,
    movement_safety_notes: row.movement_safety_notes ?? payload.movement_safety_notes ?? null,
  };
};

/* ---------- summaries for KPIs ---------- */
const summarize = (entries) => {
  const yesNo = (key) => {
    const vals = entries
      .map((entry) => parseBoolean(entry[key]))
      .filter((val) => val !== null);
    if (!vals.length) return 0;
    const yes = vals.filter(Boolean).length;
    return Math.round((100 * yes) / vals.length);
  };

  const sum = (key) =>
    entries.reduce((acc, cur) => {
      const num = numberOrNull(cur[key]);
      return num !== null ? acc + num : acc;
    }, 0);

  const promptVals = entries
    .map((entry) => numberOrNull(entry.new_skill_score))
    .filter((num) => num !== null);
  const promptAvg = promptVals.length
    ? +(
        promptVals.reduce((total, value) => total + value, 0) / promptVals.length
      ).toFixed(2)
    : null;

  return {
    counts: { entries: entries.length },
    percents: {
      hygiene_yes: yesNo('hygiene'),
      food_prep_yes: yesNo('food_prep'),
      cleanup_yes: yesNo('cleanup'),
    },
    totals: {
      vocational_minutes: sum('vocational_time'),
      community_minutes: sum('community_time'),
    },
    averages: { new_skill_score: promptAvg },
  };
};

/* ---------- chart series (monthly) ---------- */
const buildSeries = (entries) => {
  const byMonth = new Map();
  for (const entry of entries) {
    const ts = normTs(entry);
    if (Number.isNaN(ts.getTime())) continue;
    const key = toLocalMonthKey(ts);
    if (!key) continue;
    const agg = byMonth.get(key) || { h: 0, f: 0, c: 0, prompts: [] };
    if (parseBoolean(entry.hygiene) === true) agg.h += 1;
    if (parseBoolean(entry.food_prep) === true) agg.f += 1;
    if (parseBoolean(entry.cleanup) === true) agg.c += 1;
    const prompt = numberOrNull(entry.new_skill_score);
    if (prompt !== null) agg.prompts.push(prompt);
    byMonth.set(key, agg);
  }

  const monthly = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, agg]) => ({
      x: month,
      hygiene_yes: agg.h,
      food_prep_yes: agg.f,
      cleanup_yes: agg.c,
      avg_new_skill_score: agg.prompts.length
        ? +(
            agg.prompts.reduce((sum, val) => sum + val, 0) / agg.prompts.length
          ).toFixed(2)
        : null,
    }));

  return { daily: [], monthly };
};

/* ---------- main loader (safe) ---------- */
export async function loadCaregiverCheckins(
  userId,
  { range = 'all', includeAllUsers = false, groupId = null } = {}
) {
  let uid = userId ?? null;
  if (!includeAllUsers && !uid) {
    try {
      const session = getSessionFromStorage();
      uid = session?.user?.id || null;
    } catch {
      uid = null;
    }
  } else if (includeAllUsers) {
    uid = null;
  }

  const now = new Date();
  let start = new Date(0);
  if (range === 'day') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  } else if (range === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (range === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
  } else if (range === '6months') {
    start = new Date(now);
    start.setDate(start.getDate() - 183);
  }

  try {
    const filters = [];
    if (uid) filters.push(`user_id=eq.${encodeURIComponent(uid)}`);

    const params = [
      'select=*',
      'order=submitted_at.desc.nullslast',
      'order=created_at.desc.nullslast',
      ...filters,
    ];
    const path = `caregiver_checkins?${params.join('&')}`;
    const data = await rest(path);

    const normalized = Array.isArray(data)
      ? data.map(normalizeSupabaseEntry)
      : [];
    const filtered = normalized.filter((row) => {
      const ts = normTs(row);
      const time = ts.getTime();
      if (Number.isNaN(time)) return false;
      return ts >= start;
    });

    const deduped = [];
    const seen = new Set();
    for (const row of filtered) {
      const key = row.id || row.submitted_at || row.timestamp || row.created_at;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      deduped.push(row);
    }

    deduped.sort((a, b) => normTs(b) - normTs(a));

    return {
      entries: deduped,
      summary: summarize(deduped),
      charts: buildSeries(deduped),
      range_label: range === 'all' ? 'All time' : range,
    };
  } catch (error) {
    console.error('Supabase caregiver_checkins error:', error);
    return {
      entries: [],
      summary: summarize([]),
      charts: buildSeries([]),
      range_label: range === 'all' ? 'All time' : range,
    };
  }
}

/* ---------- row formatter for simple tables ---------- */
const yesNoLabel = (value) => {
  const bool = parseBoolean(value);
  if (bool === true) return 'Yes';
  if (bool === false) return 'No';
  return '—';
};

// Generates YYYY-MM keys using local time so chart groupings reflect the caregiver's timezone.
const toLocalMonthKey = (value) => {
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dt.getFullYear()}-${month}`;
};

// Converts UTC timestamps from Supabase into local strings so the caregiver report does not shift forward a day.
const toLocalDateTimeLabel = (value) => {
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  const dateLabel = dt.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
  const timeLabel = dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${dateLabel} • ${timeLabel}`;
};

const minutesLabel = (value, fallback) => {
  const num =
    numberOrNull(value) ??
    minutesFrom(fallback ?? (typeof value === 'string' ? value : null));
  return num !== null ? String(num) : '—';
};

export function formatEntryForList(entry = {}) {
  const payload = ensurePayload(entry);
  const ts = normTs(entry);
  const dateTime = toLocalDateTimeLabel(ts);

  const hygiene = coalesce(
    entry.hygiene,
    payload.hygiene,
    payload.hygiene_flag,
    gleanAdlFlag(payload, ['hygiene', 'toilet'])
  );
  const foodPrep = coalesce(
    entry.food_prep,
    payload.food_prep,
    payload.prepared_food,
    gleanAdlFlag(payload, ['cook', 'food'])
  );
  const cleanup = coalesce(
    entry.cleanup,
    payload.cleanup,
    payload.cleanup_flag,
    gleanAdlFlag(payload, ['clean', 'laundry'])
  );

  const vocational = minutesLabel(
    entry.vocational_time,
    payload.vocational_time ?? payload.vocational_minutes
  );
  const community = minutesLabel(
    entry.community_time,
    payload.community_time ??
      payload.community_minutes ??
      ((payload.home_activity_time || payload.public_activity_time) &&
        ((minutesFrom(payload.home_activity_time) || 0) +
          (minutesFrom(payload.public_activity_time) || 0)))
  );

  const prompt =
    numberOrNull(entry.new_skill_score) ??
    numberOrNull(payload.prompting_level) ??
    numberOrNull(payload.new_skill_score);

  const notes =
    entry.caregiver_notes ??
    buildNotes(entry, payload) ??
    '';

  return {
    id: entry.id || entry.uuid || null,
    dateTime,
    hygiene: yesNoLabel(hygiene),
    food_prep: yesNoLabel(foodPrep),
    cleanup: yesNoLabel(cleanup),
    vocational_time: vocational,
    community_time: community,
    new_skill_score: prompt !== null ? String(prompt) : '—',
    notes,
    file_url: entry.file_url || payload.file_url || '',
  };
}
