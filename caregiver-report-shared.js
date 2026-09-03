export const CALENDAR_EMOJI = {
  bm: '💩',
  sleep_concern: '😴',
  prn: '💊',
  illness: '🤒',
  temp: '🌡️',
  appetite: '🍽️',
  med_change: '📝',
  moon: '🌕',
  anomaly: '🚩',
  sleep: '😴',
  sleep_low: '😴',
  onset: '😴',
  night: '😴',
  prn_sleep: '💊',
  prn_mania: '💊',
  prn_aggr: '💊',
  tired: '🚩',
  manic: '🚩',
  sick: '🤒',
  menstrual: '🚩',
};

export const CALENDAR_QUICK_LOOK_ITEMS = [
  { key: 'bm', label: 'BM', emoji: CALENDAR_EMOJI.bm },
  { key: 'sleep_concern', label: 'Sleep concern', emoji: CALENDAR_EMOJI.sleep_concern },
  { key: 'prn', label: 'PRN used', emoji: CALENDAR_EMOJI.prn },
  { key: 'illness', label: 'Illness/discomfort', emoji: CALENDAR_EMOJI.illness },
  { key: 'appetite', label: 'Appetite change', emoji: CALENDAR_EMOJI.appetite },
  { key: 'med_change', label: 'Medication change', emoji: CALENDAR_EMOJI.med_change },
  { key: 'moon', label: 'Full moon', emoji: CALENDAR_EMOJI.moon },
  { key: 'anomaly', label: 'Significant concern', emoji: CALENDAR_EMOJI.anomaly },
];

/* -------------------------------------------------------------------------- */
/* Caregiver report normalization (data accuracy only)                       */
/* -------------------------------------------------------------------------- */

const TRUE_SET = new Set(['true', 't', 'yes', 'y', '1', 'on', 'done', 'complete', 'present']);
const FALSE_SET = new Set(['false', 'f', 'no', 'n', '0', 'off', 'absent', 'none']);

function parseBooleanLoose(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value > 0 ? true : value === 0 ? false : null;
  if (typeof value === 'string') {
    const norm = value.trim().toLowerCase();
    if (!norm) return null;
    if (TRUE_SET.has(norm)) return true;
    if (FALSE_SET.has(norm)) return false;
  }
  return null;
}

function normalizeAdlCategoryKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ADL_CATEGORY_FLAGS = {
  hygiene: ['hygiene toileting', 'hygiene', 'toileting'],
  food_prep: ['cooking food', 'food prep', 'food preparation', 'cooking', 'food'],
  cleanup: ['cleaning household', 'cleaning', 'household', 'laundry'],
};

function adlCategoryMatchesFlag(category, flag) {
  const normalized = normalizeAdlCategoryKey(category);
  const aliases = ADL_CATEGORY_FLAGS[flag] || [];
  return aliases.some((alias) => {
    const a = normalizeAdlCategoryKey(alias);
    return (
      normalized === a ||
      normalized.includes(a) ||
      a.includes(normalized)
    );
  });
}

function parseJsonishArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function stableStringify(obj) {
  if (!obj || typeof obj !== 'object') return String(obj);
  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

function pickMinutesFromValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).replace(/\u2013/g, '-').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!raw) return null;

  // Quick exact matches (covers the values used by duration picker).
  const durationMap = new Map([
    ['0', 0],
    ['0 min', 0],
    ['0 mins', 0],
    ['0 minutes', 0],
    ['15-30 min', 30],
    ['15 to 30 min', 30],
    ['30-60 min', 60],
    ['30 to 60 min', 60],
    ['1-2 hrs', 120],
    ['1 to 2 hrs', 120],
    ['1 hr', 60],
    ['1 hour', 60],
    ['1 hrs', 60],
    ['2 hrs', 120],
    ['2 hours', 120],
    ['2+ hrs', 150],
    ['2+ hours', 150],
    ['over 2 hrs', 150],
    ['over 2 hours', 150],
    ['2 hrs+', 150],
  ]);
  if (durationMap.has(raw)) return durationMap.get(raw);

  // Ranges: take the upper bound.
  const rangeMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const upper = parseFloat(rangeMatch[2]);
    if (Number.isFinite(upper)) {
      return raw.includes('hr') ? Math.round(upper * 60) : Math.round(upper);
    }
  }

  // Single unit.
  const hoursMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:hr|hour|hrs|hours)\b/);
  if (hoursMatch) return Math.round(parseFloat(hoursMatch[1]) * 60);

  const minutesMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:min|minute|minutes)\b/);
  if (minutesMatch) return Math.round(parseFloat(minutesMatch[1]));

  // Pure number fallback.
  const numeric = parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (Number.isFinite(numeric)) return numeric;
  return null;
}

function getCheckinDateValue(entry = {}) {
  return (
    entry.date ||
    entry.submitted_at ||
    entry.timestamp ||
    entry.created_at ||
    entry.payload?.date ||
    entry.payload?.shiftDate ||
    entry.payload?.submitted_at ||
    entry.payload?.timestamp ||
    entry.payload?.created_at ||
    null
  );
}

function getCheckinDayKeyFromEntry(entry = {}) {
  const value = getCheckinDateValue(entry);
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeAdlEntriesForReport(entry = {}) {
  const payload = entry.payload && typeof entry.payload === 'object' && !Array.isArray(entry.payload)
    ? entry.payload
    : {};
  const rootAdl = parseJsonishArray(entry.adl_entries).filter((x) => x && typeof x === 'object');
  const payloadAdl = parseJsonishArray(payload.adl_entries).filter((x) => x && typeof x === 'object');

  const merged = [...rootAdl, ...payloadAdl];
  const deduped = [];
  const seen = new Set();
  for (const item of merged) {
    const id = item.id ?? item.uuid ?? null;
    const key = id != null ? `id:${String(id)}` : `obj:${stableStringify(item)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function collectAllAdlCategoryStrings(adlEntries, entry = {}) {
  const payload = entry.payload || {};
  const fromTasks = (adlEntries || [])
    .map((item) => item?.category || item?.activity || item?.label || item?.name || item?.skill || item?.task || '')
    .map((s) => String(s).trim())
    .filter(Boolean);

  const adlCategoryRaw = entry.adl_category ?? payload.adl_category ?? payload.adlCategory ?? payload.daily_living_category ?? payload.dailyLivingCategory ?? '';
  let fromCategoryField = [];
  if (typeof adlCategoryRaw === 'string') {
    const trimmed = adlCategoryRaw.trim();
    if (trimmed) {
      // Try JSON array first, then split by commas.
      fromCategoryField = parseJsonishArray(trimmed);
      if (!fromCategoryField.length) {
        fromCategoryField = trimmed.split(',').map((s) => s.trim()).filter(Boolean).map((s) => ({ category: s }));
      } else {
        fromCategoryField = fromCategoryField.filter(Boolean).map((s) => ({ category: String(s) }));
      }
    }
  } else if (Array.isArray(adlCategoryRaw)) {
    fromCategoryField = adlCategoryRaw.map((s) => ({ category: String(s) })).filter((x) => x.category);
  }

  const fromField = fromCategoryField.map((x) => x.category).filter(Boolean);
  return [...fromTasks, ...fromField];
}

function resolveAdlSupportFlags(entry = {}) {
  const adlEntries = entry.adl_entries || [];
  const categories = collectAllAdlCategoryStrings(adlEntries, entry);
  const hasEvidence = categories.length > 0;

  const hygieneHit = categories.some((c) => adlCategoryMatchesFlag(c, 'hygiene'));
  const foodHit = categories.some((c) => adlCategoryMatchesFlag(c, 'food_prep'));
  const cleanupHit = categories.some((c) => adlCategoryMatchesFlag(c, 'cleanup'));

  const rootHygiene = parseBooleanLoose(entry.hygiene);
  const rootFood = parseBooleanLoose(entry.food_prep);
  const rootCleanup = parseBooleanLoose(entry.cleanup);

  const resolveOne = (rootVal, catHit) => {
    // Evidence-based rule: categories say "yes" wins; otherwise fall back to root.
    if (catHit) return true;
    if (rootVal === true) return true;
    if (rootVal === false && !catHit) return false;
    if (hasEvidence) return false; // we had category evidence but no matching support
    return null;
  };

  return {
    hygieneCompleted: resolveOne(rootHygiene, hygieneHit),
    foodPrepCompleted: resolveOne(rootFood, foodHit),
    cleanupCompleted: resolveOne(rootCleanup, cleanupHit),
    hasAdlCategoryEvidence: hasEvidence,
  };
}

/**
 * Normalized source-of-truth object for caregiver check-ins.
 * We keep the original `entry` reference but attach normalized keys so
 * every report section can consume the same fields.
 */
export function normalizeCaregiverCheckinRecord(entry = {}) {
  if (!entry || typeof entry !== 'object') return entry;

  const payload = entry.payload && typeof entry.payload === 'object' && !Array.isArray(entry.payload)
    ? entry.payload
    : {};
  entry.payload = payload;

  const dateKey = getCheckinDayKeyFromEntry(entry);
  const submittedAt = (() => {
    const v = entry.submitted_at || entry.timestamp || entry.created_at || null;
    const d = v ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  })();

  // Minutes (normalized)
  const vocationalMinutesRaw = entry.vocational_time ?? payload.vocational_time ?? payload.vocational_minutes ?? null;
  const homeMinutesRaw = entry.home_time ?? payload.home_activity_time ?? payload.home_time ?? payload.home_minutes ?? null;
  const publicMinutesRaw = entry.public_time ?? payload.public_activity_time ?? payload.public_time ?? payload.public_minutes ?? payload.community_minutes ?? null;
  const vocationalMinutes = pickMinutesFromValue(vocationalMinutesRaw);
  const homeMinutes = pickMinutesFromValue(homeMinutesRaw);
  const publicMinutes = pickMinutesFromValue(publicMinutesRaw);

  const communityMinutesRaw =
    entry.community_time ?? payload.community_time ?? payload.community_minutes ?? null;
  const communityMinutesFromRoot = pickMinutesFromValue(communityMinutesRaw);
  const hasHomeOrPublic =
    homeMinutes !== null && homeMinutes !== undefined
      ? true
      : publicMinutes !== null && publicMinutes !== undefined;
  const communityMinutes = communityMinutesFromRoot !== null && communityMinutesFromRoot !== undefined
    ? communityMinutesFromRoot
    : hasHomeOrPublic
      ? ((homeMinutes ?? 0) + (publicMinutes ?? 0))
      : null;

  // ADL tasks (normalized + deduped)
  const adlEntries = normalizeAdlEntriesForReport(entry);
  entry.adl_entries = adlEntries;
  payload.adl_entries = adlEntries;

  const adlTaskCount = adlEntries.length;
  const { hygieneCompleted, foodPrepCompleted, cleanupCompleted } = resolveAdlSupportFlags({
    ...entry,
    adl_entries: adlEntries,
    payload,
  });

  const adlDay = (dateKey && (adlTaskCount > 0 || hygieneCompleted === true || foodPrepCompleted === true || cleanupCompleted === true))
    ? dateKey
    : null;

  // Health flags
  const hadBm = (() => {
    const v = entry.had_bm ?? payload.had_bm ?? payload.bm_today ?? null;
    return parseBooleanLoose(v);
  })();

  // Movement fields (left as-is when present, but resolved to stable primitives when possible)
  const movement_present = parseBooleanLoose(entry.movement_present ?? payload.movement_present);
  const movement_severity = (() => {
    const v = entry.movement_severity ?? payload.movement_severity;
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  })();

  // Notes-only ADL audit helpers (used in console audit)
  const dailyLivingNotes = payload.daily_living_notes ?? payload.dailyLivingNotes ?? null;

  // Attach normalized keys (keeping existing keys for compatibility).
  entry.dateKey = dateKey;
  entry.submittedAt = submittedAt;

  entry.vocationalMinutes = vocationalMinutes ?? 0;
  entry.homeMinutes = homeMinutes ?? 0;
  entry.publicMinutes = publicMinutes ?? 0;
  entry.communityMinutes = communityMinutes ?? 0;

  entry.vocational_time = vocationalMinutes ?? null;
  entry.home_time = homeMinutes ?? null;
  entry.public_time = publicMinutes ?? null;
  entry.community_time = communityMinutes;

  entry.hygiene = hygieneCompleted;
  entry.food_prep = foodPrepCompleted;
  entry.cleanup = cleanupCompleted;

  entry.had_bm = hadBm;
  entry.adlTaskCount = adlTaskCount;
  entry.adlDay = adlDay;
  entry.dailyLivingNotes = dailyLivingNotes;

  entry.movement_present = movement_present ?? null;
  entry.movement_severity = movement_severity ?? null;

  // Requested "normalized object" shape (for debugging / audit consumers)
  const normalized = {
    id: entry.id ?? entry.uuid ?? null,
    group_id: entry.group_id ?? payload.group_id ?? null,
    user_id: entry.user_id ?? null,
    caregiver_name: entry.caregiver_name ?? payload.caregiver_name ?? null,
    dateKey,
    submittedAt,
    vocationalMinutes,
    homeMinutes,
    publicCommunityMinutes: publicMinutes,
    communityMinutes,
    adlEntries,
    adlTaskCount,
    adlDay,
    hygieneCompleted,
    foodPrepCompleted,
    cleanupCompleted,
    hadBm,
    movement: {
      present: entry.movement_present ?? movement_present ?? null,
      mainType: entry.movement_main_type ?? payload.movement_main_type ?? null,
      severity: entry.movement_severity ?? movement_severity ?? null,
      times: entry.movement_times ?? payload.movement_times ?? null,
    },
    healthFlags: {
      hadBm,
    },
    dailyLivingNotes,
  };

  return Object.assign(entry, normalized);
}

function pickNumberForCalendar(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = String(value).toLowerCase();
    if (/\b10\+|\bten\+/.test(text)) return 10;
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function parsePrnEntriesForCalendar(value) {
  return parseJsonishArray(value)
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      time: String(entry.time || entry.prn_time || '').trim(),
      medication: String(entry.medication || entry.prn_name || entry.medication_name || '').trim(),
      reason: String(entry.reason || entry.prn_reason || entry.purpose || '').trim(),
      notes: String(entry.notes || entry.note || '').trim(),
    }))
    .filter((entry) => entry.time || entry.medication || entry.reason || entry.notes);
}

function prnEntriesContain(entries = [], terms = []) {
  return entries.some((entry) => {
    const haystack = `${entry.reason || ''} ${entry.notes || ''}`.toLowerCase();
    return terms.some((term) => haystack.includes(term));
  });
}

function hasLateSleepOnsetForCalendar(source = {}) {
  const direct = source.sleep_onset_difficulty ?? source.difficulty_sleep_onset ?? null;
  const parsed = parseBooleanLoose(direct);
  if (parsed !== null) return parsed;
  const text = String(
    source.sleep_onset_duration ??
    source.sleep_onset_minutes ??
    source.sleep_onset ??
    source.sleep_latency ??
    source.sleep_latency_minutes ??
    ''
  ).toLowerCase();
  if (!text) return false;
  if (/under\s*30|<\s*30/.test(text)) return false;
  if (/120|180|2-3|3\+|over 2|two to three|three plus/.test(text)) return true;
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hour)/);
  if (hours) return Number(hours[1]) >= 2;
  const minutes = text.match(/(\d+(?:\.\d+)?)\s*(?:m|min)/);
  return minutes ? Number(minutes[1]) >= 120 : false;
}

function hasAppetiteChangeForCalendar(source = {}) {
  const candidates = [
    source.appetite_change_flag,
    source.appetite_change,
    source.change_in_appetite,
    source.appetite_flag,
    source.behavior_appetite,
    source.appetite_notes,
  ];
  for (const value of candidates) {
    const parsed = parseBooleanLoose(value);
    if (parsed !== null) return parsed;
    const text = String(value || '').trim().toLowerCase();
    if (!text || text === 'normal' || text.includes('no change')) continue;
    if (/(less|more|low|high|reduced|increase|decrease)/.test(text)) return true;
  }
  return false;
}

function hasAnyCalendarObservation(flags, notes) {
  return Object.entries(flags || {}).some(([key, value]) => {
    if (['sleep', 'legacy'].includes(key)) return false;
    if (Array.isArray(value)) return value.length > 0;
    return !!value;
  })
    || (Array.isArray(notes) && notes.length > 0);
}

function friendlyCalendarLabel(map, value) {
  const key = String(value || '').trim().toLowerCase();
  return map[key] || '';
}

function formatCalendarPrnTime(time) {
  const raw = String(time || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  let hour = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour)) return raw;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

function compactCalendarLines(lines, limit = 3) {
  const out = [];
  for (const line of lines) {
    const text = String(line || '').trim();
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

export function normalizeCaregiverCheckinForCalendar(record = {}) {
  const normalized = normalizeCaregiverCheckinRecord({ ...(record || {}) });
  const payload = normalized.payload || {};
  const dateKey = normalized.dateKey || getCheckinDayKeyFromEntry(normalized);
  const prnEntries = parsePrnEntriesForCalendar(payload.prn_entries ?? normalized.prn_entries);
  const hasStructuredPrn = prnEntries.length > 0;
  const sleep = pickNumberForCalendar(payload.hours_sleep, normalized.hours_sleep, payload.sleep_hours);
  const movementPresent = parseBooleanLoose(payload.movement_present ?? normalized.movement_present);
  const movementSeverity = pickNumberForCalendar(payload.movement_severity, normalized.movement_severity);
  const moodEngagementScore = pickNumberForCalendar(payload.mood_engagement_score, payload.mood_engagement);
  const moodSpeech = String(payload.mood_speech || '').toLowerCase();
  const moodPacing = String(payload.mood_pacing || '').toLowerCase();
  const moodEnergy = String(payload.mood_energy || '').toLowerCase();
  const moodAttention = String(payload.mood_attention || '').toLowerCase();
  const moodIrritability = String(payload.mood_irritability || payload.irritability || '').toLowerCase();

  const legacySleepPrn = !hasStructuredPrn && parseBooleanLoose(payload.prn_given) === true;
  const prnSleep = parseBooleanLoose(payload.prn_used_for_sleep_disturbance ?? payload.prn_reason_sleep) === true
    || legacySleepPrn
    || prnEntriesContain(prnEntries, ['sleep', 'settling']);
  const prnAggr = parseBooleanLoose(payload.prn_used_for_aggression ?? payload.prn_reason_aggression) === true
    || parseBooleanLoose(payload.prn_aggression_given) === true
    || !!payload.prn_aggression_name
    || !!payload.prn_aggression_time
    || prnEntriesContain(prnEntries, ['aggression', 'agitation', 'anxiety', 'pacing', 'restless', 'escalat']);
  const prnMania = parseBooleanLoose(payload.prn_used_for_mania ?? payload.prn_reason_mania) === true
    || parseBooleanLoose(payload.prn_mania_given) === true
    || !!payload.prn_mania_name
    || !!payload.prn_mania_time;

  const legacy = {
    sleep,
    sleep_low: sleep !== null ? sleep < 8 : false,
    onset: hasLateSleepOnsetForCalendar(payload) || hasLateSleepOnsetForCalendar(normalized),
    night: parseBooleanLoose(payload.night_wake_flag ?? payload.night_waking) === true
      || Number(payload.night_wake_count) > 0
      || /woke|wake|waking/i.test(String(payload.night_wake_notes || '')),
    prn_sleep: prnSleep,
    prn_mania: prnMania,
    prn_aggr: prnAggr,
    tired: parseBooleanLoose(payload.appears_tired ?? normalized.appears_tired) === true
      || ['low', 'very_low', 'tired', 'fatigued'].some((term) => moodEnergy.includes(term)),
    manic: parseBooleanLoose(payload.manic_flag ?? payload.mania_flag) === true
      || pickNumberForCalendar(payload.manic_intensity) > 0
      || ['rapid_pressured', 'difficult_to_interrupt'].includes(moodSpeech)
      || ['frequent', 'nearly_constant'].includes(moodPacing),
    sick: payload.appears_good_health === false
      || parseBooleanLoose(payload.appears_good_health) === false,
    menstrual: parseBooleanLoose(payload.menstrual_present) === true,
  };
  const medChangeFlag = parseBooleanLoose(payload.med_change_flag) === true;
  const medChangeNote = String(payload.med_change_note || '').trim();
  const anyPrnUsed = hasStructuredPrn
    || prnSleep
    || prnMania
    || prnAggr
    || parseBooleanLoose(payload.prn_used_today ?? payload.prn_administered ?? payload.prn_given) === true;
  const tempRecorded = parseBooleanLoose(payload.temp_present) === true || !!payload.temp_value;
  const illness = legacy.sick
    || tempRecorded
    || parseBooleanLoose(payload.illness_symptoms ?? payload.pain_discomfort ?? payload.discomfort_present) === true
    || !!String(payload.illness_notes || payload.pain_notes || payload.discomfort_notes || '').trim();
  const appetite = hasAppetiteChangeForCalendar(payload) || hasAppetiteChangeForCalendar(normalized);
  const sleepConcern = legacy.sleep_low || legacy.onset || legacy.night;
  const anomaly = parseBooleanLoose(payload.anomaly_flag ?? payload.behavior_anomaly_flag ?? payload.behavior_anomaly_present) === true
    || movementPresent === true
    || movementSeverity > 0
    || legacy.manic
    || legacy.menstrual;

  const flags = {
    bm: normalized.hadBm === true || parseBooleanLoose(payload.had_bm ?? payload.bm_today) === true,
    sleep_concern: sleepConcern,
    prn: anyPrnUsed,
    illness,
    temp: tempRecorded,
    appetite,
    med_change: medChangeFlag || !!medChangeNote,
    moon: false,
    anomaly,
    sleep,
    sleep_low: legacy.sleep_low,
    onset: legacy.onset,
    night: legacy.night,
    prn_sleep: prnSleep,
    prn_mania: prnMania,
    prn_aggr: prnAggr,
    tired: legacy.tired,
    manic: legacy.manic,
    sick: legacy.sick,
    menstrual: legacy.menstrual,
    legacy,
    summary_lines: [],
    med_change_notes: [],
  };

  const caregiver = normalized.caregiver_name || payload.caregiver_name || '';
  const moodDetails = [
    friendlyCalendarLabel({
      high: 'Higher energy',
      higher: 'Higher energy',
      elevated: 'Higher energy',
      very_high: 'Much higher energy',
      much_higher: 'Much higher energy',
      low: 'Lower energy',
      lower: 'Lower energy',
      very_low: 'Much lower energy',
    }, moodEnergy),
    friendlyCalendarLabel({
      rapid_pressured: 'Rapid/pressured speech',
      difficult_to_interrupt: 'Very difficult to interrupt',
      hard_to_interrupt: 'Very difficult to interrupt',
    }, moodSpeech),
    friendlyCalendarLabel({
      some_difficulty: 'Some trouble focusing',
      some_trouble: 'Some trouble focusing',
      frequently_loses_focus: 'Frequently loses focus',
      frequent: 'Frequently loses focus',
    }, moodAttention),
    friendlyCalendarLabel({
      frequent: 'Frequent pacing',
      nearly_constant: 'Nearly constant pacing',
    }, moodPacing),
    friendlyCalendarLabel({
      moderate: 'Moderate irritability',
      significant: 'Significant irritability',
      severe: 'Significant irritability',
    }, moodIrritability),
  ].filter(Boolean);
  if (Number.isFinite(moodEngagementScore) && moodEngagementScore > 0) {
    const engagementLabel = moodEngagementScore >= 3
      ? 'Highly withdrawn'
      : moodEngagementScore === 2
        ? 'Mostly withdrawn'
        : 'Less engaged';
    moodDetails.push(`Engagement ${moodEngagementScore} · ${engagementLabel}`);
  }

  const participation = [];
  if (normalized.vocationalMinutes > 0 || parseBooleanLoose(payload.vocational_participation) === true) participation.push('Vocational');
  if (normalized.homeMinutes > 0 || parseBooleanLoose(payload.home_activity_flag) === true) participation.push('Home');
  if (normalized.publicMinutes > 0 || parseBooleanLoose(payload.public_activity_flag) === true) participation.push('Community');
  if (normalized.adlTaskCount > 0) participation.push(`${normalized.adlTaskCount} ADL task${normalized.adlTaskCount === 1 ? '' : 's'}`);
  const physicalDetails = [];
  if (sleepConcern) physicalDetails.push('Sleep concern');
  if (illness) physicalDetails.push(tempRecorded ? 'Illness/discomfort or temp' : 'Illness/discomfort');
  if (appetite) physicalDetails.push('Appetite change');
  if (flags.med_change) physicalDetails.push(`Medication change${medChangeNote ? `: ${medChangeNote}` : ''}`);
  if (movementPresent === true || movementSeverity > 0) physicalDetails.push('Movement concern');
  if (legacy.manic && !moodDetails.length) physicalDetails.push('Legacy elevated signal');

  const prnTimes = prnEntries.map((entry) => formatCalendarPrnTime(entry.time)).filter(Boolean);
  const prnLine = anyPrnUsed
    ? prnTimes.length
      ? `${prnTimes.length > 1 ? 'PRNs' : 'PRN'} ${prnTimes.slice(0, 3).join(', ')}${prnTimes.length > 3 ? ' +' : ''}`
      : 'PRN used'
    : '';

  const signalLines = [
    ...compactCalendarLines(moodDetails, 2),
    prnLine,
    participation.length ? participation.join(' + ') : '',
    ...physicalDetails,
  ];
  const summaryLines = compactCalendarLines([caregiver, ...signalLines], caregiver ? 4 : 3);
  if (!summaryLines.length || (caregiver && summaryLines.length === 1)) {
    summaryLines.push('No notable concerns');
  }
  if (parseBooleanLoose(payload.pet_interaction_flag) === true || payload.pet_activity_type) {
    const petLine = `Pet interaction: ${payload.pet_activity_type || 'yes'}`;
    if (summaryLines.length < 3 && !summaryLines.includes(petLine)) summaryLines.push(petLine);
  }
  flags.summary_lines = summaryLines;
  flags.med_change_notes = summaryLines;

  return {
    id: normalized.id,
    dateKey,
    flags,
    prnEntries,
    hasCheckin: !!dateKey,
    hasObservations: hasAnyCalendarObservation(flags, summaryLines),
    source: normalized,
  };
}
