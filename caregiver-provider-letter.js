import { checkinDateKey, normalizeCheckinDate, formatCheckinDate } from './caregiver-dates.js';
import { optionalYesNo, optionalEngagement } from './caregiver-answer-quality.js';

const DAY = 86400000;
const ordinal = key => Date.parse(`${key}T12:00:00Z`) / DAY;
const dateLabel = key => formatCheckinDate(key, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
// Human-facing time format. Supabase may continue storing 24-hour HH:mm.
export const formatCaregiverClockTime = value => {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) return raw; // Preserve unusual/ambiguous input rather than guessing.
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
};
const bool = value => optionalYesNo(value) === 'yes' ? true : optionalYesNo(value) === 'no' ? false : null;
const list = value => {
  if (Array.isArray(value)) return value;
  try { const result = JSON.parse(value); return Array.isArray(result) ? result : []; } catch { return []; }
};
export const NOTE_FIELDS = [
  'caregiver_notes', 'summary_highlight_note', 'physical_notes', 'behavior_notes', 'mood_regulation_notes',
  'community_notes', 'daily_living_notes', 'notes', 'public_activity_note',
  'interaction_note', 'home_notes', 'vocational_notes', 'med_change_note',
  'pet_activity_note', 'pet_activity_notes',
];
export const individualKey = row => String(row.individual_id ?? row.payload?.individual_id ?? '');
export const groupKey = row => String(row.group_id ?? row.payload?.group_id ?? row.payload?.group ?? '');

// Original field text and offsets survive independently of the report's
// synthesized caregiver_notes. Never quote that synthesized display field.
export function originalNotes(row) {
  const sources = [];
  const append = (object, prefix) => {
    for (const field of NOTE_FIELDS) {
      if (typeof object?.[field] === 'string' && object[field].trim()) {
        sources.push({ field: `${prefix}${field}`, text: object[field] });
      }
    }
  };
  append(row.payload, 'payload.');
  append(row.original_note_fields ?? (row.source === 'supabase' ? {} : row), 'row.');
  for (const [i, item] of list(row.payload?.prn_entries).entries()) {
    if (typeof item?.notes === 'string') sources.push({ field: `payload.prn_entries[${i}].notes`, text: item.notes });
  }
  const tracking = row.payload?.behavior_tracking;
  if (tracking && typeof tracking === 'object') {
    for (const [key, item] of Object.entries(tracking)) {
      if (typeof item?.notes === 'string') sources.push({ field: `payload.behavior_tracking.${key}.notes`, text: item.notes });
    }
  }
  return sources.map(source => ({ ...source, id: row.id, date: checkinDateKey(row) }));
}

const THEME_RULES = [
  ['sleep difficulties', /\b(trouble sleeping|difficulty (?:falling asleep|sleeping)|could(?:n't| not) sleep|awake (?:at|during|most)|woke (?:up |several|repeatedly)|restless night)\b/i],
  ['reduced participation', /\b(withdrawn|joined fewer|stayed away|less engaged|declined (?:the |an )?activit|needed (?:extra|more) breaks|took longer breaks)/i],
  ['pacing or restlessness', /\b(pac(?:ed|ing)|restless)\b/i],
  ['appetite difficulties', /\b(poor appetite|ate less|skipped (?:a |the )?meal|refused (?:food|lunch|dinner))\b/i],
  ['positive experiences', /\b(enjoyed|went well|successful|pleased|happy|good outing)\b/i],
  ['independence and coping', /\b(independently|asked for a break|returned to (?:cooking|activity|the activity)|used (?:a )?coping)\b/i],
];
export function analyzeNotes(rows) {
  const quotes = [], themes = new Map();
  for (const row of rows) for (const source of originalNotes(row)) {
    // Keep exact contiguous sentences, including original punctuation/spacing.
    for (const match of source.text.matchAll(/[^.!?\n]+(?:[.!?]+|$)/g)) {
      const text = match[0];
      if (!text.trim()) continue;
      // Conservative whole-sentence exclusion avoids attributing negated,
      // uncertain, historical, or other people's experiences to this date.
      const ambiguous = /\b(no|not|never|without|denied|didn't|wasn't|isn't|hasn't|hadn't|unlikely|maybe|might|possibly|would|could|will|planned|hopes|tomorrow|yesterday|last week|previously|caregiver felt|staff felt)\b/i.test(text);
      const labels = ambiguous ? [] : THEME_RULES.filter(([, rule]) => rule.test(text)).map(([name]) => name);
      const quote = { ...source, start: match.index, end: match.index + text.length, quote: text, themes: labels };
      if (text.length <= 240 && !quotes.some(q => q.date === quote.date && q.quote === text)) quotes.push(quote);
      for (const name of labels) {
        if (!themes.has(name)) themes.set(name, []);
        themes.get(name).push(quote);
      }
    }
  }
  return {
    quotes,
    themes: [...themes].map(([name, evidence]) => ({
      name, evidence, dates: [...new Set(evidence.map(e => e.date))].sort(),
      distinctWording: new Set(evidence.map(e => e.quote.trim().toLowerCase())).size,
    })),
  };
}

function observation(row) {
  const p = row.payload ?? row;
  const modern = p.answer_quality_version === 1;
  const engagement = optionalEngagement(p.mood_engagement ?? p.mood_engagement_score);
  const onset = bool(p.sleep_onset_difficulty);
  const waking = bool(p.night_wake_flag);
  const category = (value, negatives, positives) => negatives.includes(value) ? false : positives.includes(value) ? true : null;
  const sleep = onset === true || waking === true ? true : modern && onset === false && waking === false ? false : null;
  const prn = list(p.prn_entries).filter(item => item && (item.medication || item.time || item.reason));
  const prnAnswer = bool(p.prn_used_today ?? p.prn_administered);
  const tracking = Object.values(p.behavior_tracking || {});
  return {
    sleep,
    engagement: engagement === null || (!modern && engagement === 0) ? null : engagement > 0,
    withdrawal: engagement === null || (!modern && engagement === 0) ? null : engagement >= 2,
    pacing: category(p.mood_pacing, ['none'], ['occasional', 'frequent', 'nearly_constant']),
    irritability: category(p.mood_irritability, ['none'], ['mild', 'moderate', 'significant']),
    attention: category(p.mood_attention, ['typical'], ['some_difficulty', 'frequently_loses_focus', 'unable_to_stay_with_activities']),
    appetite: !modern && bool(p.appetite_change_flag) === false ? null : bool(p.appetite_change_flag),
    prn: prn.length ? true : !modern && prnAnswer === false ? null : prnAnswer,
    prnEntries: prn,
    medicationChange: bool(p.med_change_flag),
    behavior: tracking.filter(item => item?.tracking_type === 'symptom_intensity').some(item => bool(item?.occurred) === true) ? true : null,
    strengths: [
      ...['identifies_feelings', 'uses_coping_strategy', 'accepts_redirection', 'requests_break', 'recovers_after_distress', 'waits', 'returns_to_activity'].filter(key => bool(p[key]) === true),
      ...tracking.filter(item => item?.tracking_type === 'prompt_skill' && bool(item.occurred) === true).map(item => item.item_key),
    ],
  };
}
const METRICS = ['sleep', 'engagement', 'withdrawal', 'pacing', 'irritability', 'attention', 'appetite', 'prn', 'behavior'];
function dailyState(values) {
  const known = values.filter(value => typeof value === 'boolean');
  if (known.includes(true) && known.includes(false)) return 'mixed';
  return known.includes(true) ? true : known.includes(false) ? false : null;
}
function counts(days, key) {
  const positive = days.filter(day => day[key] === true);
  const negative = days.filter(day => day[key] === false);
  return { positive: positive.length, answered: positive.length + negative.length, mixed: days.filter(day => day[key] === 'mixed').length, dates: positive.map(day => day.date) };
}

export function analyzeProviderRecords(entries, { start, end, groupId, individualId = null } = {}) {
  start = normalizeCheckinDate(start); end = normalizeCheckinDate(end);
  if (!groupId || !start || !end || start > end) throw new Error('Choose a valid date range and active group.');
  const scoped = entries.filter(row => groupKey(row) === String(groupId));
  const individuals = [...new Set(scoped.map(individualKey))];
  if (individualId === null && individuals.length > 1) throw new Error('Choose one individual or the unassigned records before generating a letter.');
  const target = individualId === null ? individuals[0] ?? '' : String(individualId);
  const seen = new Set(), rows = [];
  let duplicateCopies = 0, undated = 0, dateConflicts = 0;
  for (const row of scoped.filter(row => individualKey(row) === target)) {
    const storedDate = normalizeCheckinDate(row.date);
    const payloadDate = normalizeCheckinDate(row.payload?.entry_date);
    if (storedDate && payloadDate && storedDate !== payloadDate) { dateConflicts++; continue; }
    const date = checkinDateKey(row);
    if (!date) { undated++; continue; }
    if (date < start || date > end) continue;
    if (row.id != null && seen.has(row.id)) { duplicateCopies++; continue; }
    if (row.id != null) seen.add(row.id);
    rows.push(row);
  }
  const byDate = new Map();
  for (const row of rows) {
    const date = checkinDateKey(row);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({ row, values: observation(row) });
  }
  const days = [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, records]) => ({
    date, records, ...Object.fromEntries(METRICS.map(key => [key, dailyState(records.map(record => record.values[key]))])),
  }));
  const metrics = Object.fromEntries(METRICS.map(key => [key, counts(days, key)]));
  const sleepDates = metrics.sleep.dates;
  const gaps = sleepDates.slice(1).map((date, i) => ordinal(date) - ordinal(sleepDates[i]));
  const following = { afterSleep: { total: 0, reduced: 0 }, afterNoSleep: { total: 0, reduced: 0 }, excluded: 0 };
  for (const day of days) {
    if (typeof day.sleep !== 'boolean') continue;
    const next = days.find(nextDay => ordinal(nextDay.date) === ordinal(day.date) + 1);
    if (!next || typeof next.engagement !== 'boolean') { following.excluded++; continue; }
    const bucket = day.sleep ? following.afterSleep : following.afterNoSleep;
    bucket.total++; if (next.engagement) bucket.reduced++;
  }
  const totalDays = ordinal(end) - ordinal(start) + 1;
  const half = Math.floor(totalDays / 2);
  const comparisons = [];
  // Equal length windows; for an odd length omit the center day.
  for (const key of METRICS.filter(key => key !== 'prn')) {
    const first = counts(days.filter(day => ordinal(day.date) < ordinal(start) + half), key);
    const last = counts(days.filter(day => ordinal(day.date) > ordinal(end) - half), key);
    if (first.answered >= 7 && last.answered >= 7) comparisons.push({ key, first, last });
  }
  const prnEntries = days.flatMap(day => day.records.flatMap(record => record.values.prnEntries.map(item => ({ date: day.date, id: record.row.id, item }))));
  const signatures = prnEntries.map(entry => JSON.stringify([entry.date, entry.item.medication, entry.item.time, entry.item.reason]));
  return {
    start, end, groupId, individualId: target, rows, days, metrics, totalDays,
    missingDays: totalDays - days.length, multipleEntryDays: days.filter(day => day.records.length > 1).length,
    duplicateCopies, undated, dateConflicts, historical: rows.filter(row => row.payload?.answer_quality_version !== 1).length,
    sleepGaps: gaps, regularSpacing: gaps.length >= 3 && Math.max(...gaps) - Math.min(...gaps) <= 1,
    sleepClusters: gaps.filter(gap => gap === 1).length,
    following, comparisons, notes: analyzeNotes(rows), prnEntries,
    possibleRepeatedPrn: signatures.length - new Set(signatures).size,
    cooccurring: days.filter(day => day.sleep === true && [day.engagement, day.pacing, day.irritability, day.attention].includes(true)).map(day => day.date),
  };
}

const LABELS = { sleep: 'Sleep difficulty', engagement: 'Reduced engagement', withdrawal: 'Marked withdrawal', pacing: 'Pacing', irritability: 'Irritability', attention: 'Attention difficulty', appetite: 'Appetite change', behavior: 'Other behavior observations' };
const evidenceSentence = (label, metric) => `${label} was reported on ${metric.positive} of ${metric.answered} dates with an interpretable answer${metric.mixed ? `; ${metric.mixed} additional dates had conflicting answers` : ''}.`;
export function renderProviderLetter(a, { includeQuotes = true } = {}) {
  const short = key => {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  };
  const dates = keys => {
    const groups = new Map();
    for (const key of [...new Set(keys)].sort()) {
      const month = short(key).replace(/\s+\d+$/, '');
      if (!groups.has(month)) groups.set(month, []);
      groups.get(month).push(Number(key.slice(-2)));
    }
    return [...groups].map(([month, days]) => month + ' ' + (days.length === 1 ? days[0] : days.slice(0, -1).join(', ') + ' and ' + days.at(-1))).join('; ');
  };
  const prepared = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const joinNatural = items => items.length < 3 ? items.join(' and ') : items.slice(0, -1).join(', ') + ', and ' + items.at(-1);
  const sections = ['Caregiver Observation Summary\nDate Prepared: ' + prepared, 'Dear Support Team,'];
  const add = (title, paragraphs) => {
    const content = paragraphs.filter(Boolean).join('\n\n').trim();
    if (content) sections.push(title + '\n' + content);
  };
  const p = row => row.payload ?? row;
  const yes = (row, field) => bool(p(row)[field]) === true;
  const values = value => {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    if (typeof value !== 'string' || !value.trim()) return [];
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String); } catch {}
    return value.split(/[,;|]/).map(part => part.trim()).filter(Boolean);
  };
  const activity = (flag, type) => {
    const days = [], types = new Map();
    for (const day of a.days) {
      const records = day.records.filter(({ row }) => yes(row, flag));
      if (!records.length) continue;
      days.push(day.date);
      for (const item of new Set(records.flatMap(({ row }) => values(p(row)[type])))) {
        if (item.toLowerCase() === 'other') continue;
        if (!types.has(item)) types.set(item, new Set());
        types.get(item).add(day.date);
      }
    }
    return { days, types };
  };
  // Gold-star observations are preserved verbatim later in the letter. Keep
  // other sections focused on trends and distinct experiences, not repeats.
  const goldStarObservations = a.days.flatMap(day => day.records.flatMap(({ row }) => {
    const note = String(p(row).summary_highlight_note || '').trim();
    return note ? [{ date: day.date, note }] : [];
  }));
  const normalized = value => String(value || '').toLowerCase().replace(/[“”"'.,!?;:()]/g, '').replace(/\s+/g, ' ').trim();
  const isGoldStarRepeat = (date, value) => goldStarObservations.some(item => {
    if (item.date !== date) return false;
    const gold = normalized(item.note), candidate = normalized(value);
    return !!candidate && (gold === candidate || (candidate.length >= 24 && gold.includes(candidate)));
  });
  // A quote belongs to one section only, even when its wording matches several.
  const usedQuotes = new Set();
  const quote = (pattern, { max = 1, exclude = null } = {}) => {
    if (!includeQuotes) return '';
    const selected = [], topics = new Set();
    for (const q of a.notes.quotes) {
      const value = q.quote.trim();
      // Medication-purpose and PRN notes belong in medication reporting,
      // not reinterpreted as general symptoms by keyword matching.
      if (/prn_entries\[|med_change_note|summary_highlight_note/.test(q.field)) continue;
      if (!q.date || value.length > 180 || !pattern.test(value) || exclude?.test(value) || isGoldStarRepeat(q.date, value)) continue;
      if (/\b(will|planned|tomorrow|maybe|probably not)\b/i.test(value)) continue;
      const id = q.date + ':' + value.toLowerCase();
      if (usedQuotes.has(id)) continue;
      const topic = /\b(apple|orchard)\b/i.test(value) ? 'orchard' : /\b(walk|stroll)\b/i.test(value) ? 'walk' : /\b(work|job)\b/i.test(value) ? 'work' : value.toLowerCase().replace(/[^a-z]/g, '').slice(0, 30);
      if (topics.has(topic)) continue;
      selected.push('On ' + short(q.date) + ', a caregiver noted: “' + value + '”');
      usedQuotes.add(id); topics.add(topic);
      if (selected.length >= max) break;
    }
    return selected.join(' ');
  };
  sections.push('We would like to share observations from caregiver records covering ' + short(a.start) + ' through ' + short(a.end) + '. This summary brings together the observations of all caregivers to provide an overall picture of sleep, physical health, mood, daily routines, work, and participation at home and in the wider community.');

  const sleep = a.metrics.sleep.dates;
  // Detect documented bedtime-regimen updates in original caregiver notes,
  // even when no separate medication-change flag was selected. Do not infer a
  // scheduled bedtime regimen from a PRN administration.
  const bedtimeRegimenNotes = [];
  const bedtimeSeen = new Set();
  for (const day of a.days) for (const { row } of day.records) {
    for (const source of originalNotes(row)) {
      if (source.field.includes('prn_entries')) continue;
      const note = String(source.text || '').trim();
      const namesMedication = /\b(?:benadryl|benedryl|diphenhydramine|magnesium)\b/i.test(note);
      const bedtimeContext = /\b(?:bedtime|sleep|night|nightly|evening|regimen|routine)\b/i.test(note);
      const scheduledTime = /\b6(?::|\.|\s)30\b/i.test(note);
      const startsRegimen = /\b(?:new|start(?:ed|ing)?|began|beginning|added|changed)\b/i.test(note) &&
        /\b(?:bedtime|nightly|evening)\s+(?:medications?|meds?|regimen|routine|support)\b/i.test(note);
      if (!(namesMedication && (bedtimeContext || scheduledTime)) && !startsRegimen) continue;
      const key = day.date + ':' + normalized(note);
      if (bedtimeSeen.has(key)) continue;
      bedtimeSeen.add(key);
      bedtimeRegimenNotes.push({ date: day.date, note });
    }
  }
  const bedtimeRegimenQuoted = (date, note) => bedtimeRegimenNotes.some(
    entry => entry.date === date && normalized(entry.note) === normalized(note)
  );
  const bedtime = a.days.flatMap(day => day.records.map(({ row }) => {
    const raw = String(p(row).sleep_fell_asleep_time || '').trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return null;
    const [hour, minute] = raw.split(':').map(Number);
    const formatted = (hour % 12 || 12) + ':' + String(minute).padStart(2, '0') + ' ' + (hour >= 12 ? 'PM' : 'AM');
    return { date: day.date, formatted };
  }).filter(Boolean)).sort((x, y) => y.date.localeCompare(x.date));
  const fatigue = a.notes.quotes.filter(q => /\b(tired|fatigue|exhausted|low energy|little sleep|did not sleep|didn't sleep)\b/i.test(q.quote));
  if (sleep.length || fatigue.length || bedtime.length || bedtimeRegimenNotes.length) {
    const paragraphs = [];
    if (sleep.length) paragraphs.push('Sleep difficulties or nighttime waking were recorded on ' + dates(sleep) + '.');
    const documentedRegimens = bedtimeRegimenNotes.filter(item => !isGoldStarRepeat(item.date, item.note));
    if (documentedRegimens.length) {
      paragraphs.push(...documentedRegimens.map(item => 'On ' + short(item.date) +
        ', a caregiver documented bedtime medication/routine information' +
        (includeQuotes ? ': “' + item.note + '”' : '.') ));
    }
    if (bedtime.length) {
      const latest = bedtime[0];
      paragraphs.push('A caregiver recorded falling asleep at ' + latest.formatted + ' on ' + short(latest.date) + '.');
    }
    const energyQuote = quote(/\b(tired|fatigue|exhausted|low energy)\b/i, { max: 2, exclude: /\b(tummy|stomach|shots)\b/i });
    if (energyQuote) paragraphs.push('Caregivers also described changes in daytime energy and activity. ' + energyQuote);
    add('Sleep and Energy', paragraphs);
  }

  // Quote a specific symptom, not a speculative explanation for its cause.
  const physicalPattern = /\b(tummy|stomach|belly|nausea|vomit|diarrhea|constipat|bowel|headache|migraine|pain|ache|aching|sore|fever|sick|illness|dizzy|rash|swelling|injur|hurt)\b/i;
  const physicalDates = [...new Set(a.notes.quotes.filter(q => physicalPattern.test(q.quote)).map(q => q.date).filter(Boolean))];
  if (physicalDates.length) add('Physical Health and Well-Being', [
    'Physical health or comfort concerns were mentioned on ' + dates(physicalDates) + '.',
    quote(physicalPattern, { max: 2 }),
  ]);

  // A safety incident is an event, not a routine behavior rating. Show
  // documented incidents independently of gold-star notes and general trends.
  // Count dates, not distinct events, because separate check-ins on one day may
  // refer to the same event and should not inflate the incident count.
  const safetyIncidents = [];
  const safetyKeys = new Set();
  for (const day of a.days) for (const { row } of day.records) {
    const data = p(row);
    if (bool(data.safety_incident_occurred) !== true) continue;
    const location = String(data.safety_incident_location || '').trim();
    const source = String(data.safety_incident_source || '').trim();
    const reporter = String(data.safety_incident_reporter || '').trim();
    const detail = String(data.safety_incident_details || '').trim();
    // A name may be present in an actual check-in, but a generic "Caregiver"
    // is not an identifying name. Never invent who witnessed an incident.
    const author = String(data.caregiver_name || row.caregiver_name || '').trim();
    const signature = [day.date, location, source, reporter, detail]
      .map(part => normalized(part)).join('|');
    if (safetyKeys.has(signature)) continue;
    safetyKeys.add(signature);
    safetyIncidents.push({ date: day.date, location, source, reporter, author, detail });
  }
  if (safetyIncidents.length) {
    const datesWithIncidents = [...new Set(safetyIncidents.map(item => item.date))];
    const paragraphs = [
      'A behavior or safety incident was documented on ' +
      (datesWithIncidents.length === 1 ? 'the following date: ' : 'the following dates: ') +
      dates(datesWithIncidents) + '.'
    ];
    const usableName = name => /^(?!caregiver$|staff$|unknown$|n\/?a$|not specified$).+/i.test(String(name || '').trim());
    for (const incident of safetyIncidents) {
      const title = short(incident.date) + (incident.location ? ' — ' + incident.location : '');
      const observer = usableName(incident.reporter) ? incident.reporter
        : incident.source === 'direct_observation' && usableName(incident.author) ? incident.author : '';
      const attribution = observer
        ? (incident.source === 'reported_by_other' ? 'Reported by ' : 'Observed by ') + observer
        : incident.source === 'reported_by_other' ? 'Reported by another person' : '';
      paragraphs.push(title + '\n' +
        (attribution ? attribution + '\n' : '') +
        (incident.detail || 'Incident reported; no description was provided.'));
    }
    add('Behavior & Safety Incidents', paragraphs);
  }

  const behaviorLabels = [
    ['engagement', 'reduced engagement'], ['withdrawal', 'withdrawal'],
    ['pacing', 'pacing or restlessness'], ['irritability', 'irritability'],
    ['attention', 'difficulty maintaining attention'],
  ];
  const behavior = behaviorLabels.filter(([key]) => a.metrics[key].dates.length);
  if (behavior.length) {
    const parts = [];
    const engagement = behavior.filter(([key]) => key === 'engagement' || key === 'withdrawal');
    const regulation = behavior.filter(([key]) => key !== 'engagement' && key !== 'withdrawal');
    if (engagement.length) parts.push('Caregivers recorded changes in participation and engagement, including ' + engagement.map(([key, label]) => label + ' on ' + a.metrics[key].dates.length + ' days').join(' and ') + '. These observations appeared on multiple days during the reporting period.');
    if (regulation.length) parts.push('Other observations included ' + joinNatural(regulation.map(([key, label]) => label + ' on ' + a.metrics[key].dates.length + ' days')) + '.');
    const behaviorQuote = quote(/\b(pacing|paced|restless|snappy|irritab|withdrawn|engag|manic|pressured speech)\b/i, {
      max: 2, exclude: /\b(stopping manic cycles|preventing mania|to prevent manic symptoms)\b/i
    });
    if (behaviorQuote) parts.push(behaviorQuote);
    add('Mood, Engagement, and Behavior', parts);
  }

  const vocational = activity('vocational_participation', 'vocational_activity_type');
  if (vocational.days.length) {
    const parts = ['Vocational participation was documented on ' + vocational.days.length + ' different ' + (vocational.days.length === 1 ? 'day' : 'days') + ' during this period.'];
    if (vocational.types.size) parts.push('Recorded activities included ' + [...vocational.types.keys()].slice(0, 7).join(', ') + '.');
    const workNotes = a.notes.quotes.filter(q => q.date && /\b(work|job|maintenance|employment|job coach|vocational)\b/i.test(q.quote) && q.quote.trim().length <= 180 && !/\b(will|planned|tomorrow|did not|didn't)\b/i.test(q.quote));
    const distinctiveWork = workNotes.find(q => /\b(met|new|learned|helped|completed|independent|task|coach)\b/i.test(q.quote));
    if (distinctiveWork && includeQuotes && !isGoldStarRepeat(distinctiveWork.date, distinctiveWork.quote)) {
      parts.push('A specific workplace experience noted on ' + short(distinctiveWork.date) + ' was: “' + distinctiveWork.quote.trim() + '”');
      usedQuotes.add(distinctiveWork.date + ':' + distinctiveWork.quote.trim().toLowerCase());
    } else parts.push(quote(/\b(work|job|maintenance|employment|job coach)\b/i, { max: 1 }));
    add('Vocational Participation', parts);
  }

  const home = activity('home_activity_flag', 'home_activity_type');
  const community = activity('public_activity_flag', 'public_activity_type');
  const cleanActivity = value => ({
    'Walk / Stroll': 'walks', 'Movie in living room': 'watching movies together',
    'Art / craft project': 'arts and crafts', 'Outside time in yard / neighborhood': 'time outdoors',
    'Restaurant/Café': 'restaurants and cafés', 'Went to store': 'shopping and errands',
    'Shopping – grocery/retail': 'shopping and errands', 'Went to recycling': 'recycling trips',
  })[value] || value.toLowerCase();
  const activitiesText = data => joinNatural([...new Set([...data.types].sort((a, b) => b[1].size - a[1].size).map(([name]) => cleanActivity(name)))].slice(0, 7));
  const allNotes = a.notes.quotes.filter(q => q.date && q.quote.trim().length <= 200);
  const relevant = (pattern, exclude = /$^/) => allNotes.filter(q => pattern.test(q.quote) && !exclude.test(q.quote) && !/\b(will|tomorrow|planned|might|didn't|did not|refused)\b/i.test(q.quote));
  const experience = (matches, phrase) => {
    if (!matches.length) return '';
    const q = matches[0];
    const id = q.date + ':' + q.quote.trim().toLowerCase();
    if (usedQuotes.has(id) || isGoldStarRepeat(q.date, q.quote)) return '';
    usedQuotes.add(id);
    return phrase + ' (' + short(q.date) + ').';
  };
  if (home.days.length || community.days.length) {
    const parts = [];
    if (home.days.length) parts.push('At home and with family, participation was documented on ' + home.days.length + ' ' + (home.days.length === 1 ? 'day' : 'days') + (home.types.size ? '. Activities included ' + activitiesText(home) + '.' : '.'));
    if (community.days.length) parts.push('Participation in the wider community was documented on ' + community.days.length + ' ' + (community.days.length === 1 ? 'day' : 'days') + (community.types.size ? ', with regular activities such as ' + activitiesText(community) + '.' : '.'));
    const highlights = [];
    const orchard = relevant(/\b(orchard|apple picking|pumpkin patch)\b/i).sort((a, b) => {
      const visit = q => /\b(went|going|visited|visit|trip|at the orchard)\b/i.test(q.quote) ? 0 : 1;
      return visit(a) - visit(b);
    });
    if (orchard.length) {
      const q = orchard[0];
      const visit = /\b(went|going|visited|visit|trip|at the orchard)\b/i.test(q.quote);
      highlights.push(experience([q], visit ? 'A caregiver described an orchard visit' : 'A caregiver mentioned an experience involving the orchard'));
    }
    const destinations = relevant(/\b(yankee candle|christmas village|halloween village|museum|festival|fair|concert|field trip|farm|nature center)\b/i);
    if (destinations.length) {
      const q = destinations[0];
      const mention = q.quote.trim();
      highlights.push(experience([q], 'Another noteworthy outing was described as “' + mention + '”'));
    }
    const social = relevant(/\b(greeted|said hello|made conversation|introduced himself|ordered (?:his|their|her) own)\b/i, /\b(work|job|maintenance)\b/i);
    if (social.length) highlights.push(experience(social, 'A caregiver described this social interaction: “' + social[0].quote.trim() + '”'));
    const other = relevant(/\b(library|zoo|parade|birthday party|hiking trail)\b/i);
    if (other.length) highlights.push(experience(other, 'Another experience noted by a caregiver'));
    // Family routines are meaningful memory cues too, even when they are not
    // unusual destinations. Use an original caregiver observation, once only.
    const family = relevant(/\b(sunday dinner|dinner|living room|grandma|grandmother|family visit|with family|movie|coloring|craft|walk with|walked with)\b/i);
    const familyExample = family.find(q =>
      !usedQuotes.has(q.date + ':' + q.quote.trim().toLowerCase()) && !isGoldStarRepeat(q.date, q.quote) &&
      !/\b(work|job|maintenance|PRN|medication|sleep|night|overnight|awake|woke|tired|manic|anxiety|up and down)\b/i.test(q.quote)
    );
    if (familyExample && includeQuotes) {
      const detail = familyExample.quote.trim();
      highlights.push(experience([familyExample], 'A caregiver also described time with family: “' + detail + '”'));
    }
    if (highlights.filter(Boolean).length) parts.push(highlights.filter(Boolean).join(' '));
    add('Community and Family Participation', parts);
  }

  // Educational/skill-development notes are a separate, optional 180-character
  // narrative field. Retain every dated entry from the selected caregiver records.
  const educationNotes = a.days.flatMap(day => day.records.flatMap(({ row }) => {
    const note = String(p(row).educational_note || '').trim();
    return note ? [{ date: day.date, note }] : [];
  }));
  if (educationNotes.length) {
    const independent = educationNotes.filter(item => !isGoldStarRepeat(item.date, item.note));
    const overlapping = educationNotes.filter(item => isGoldStarRepeat(item.date, item.note));
    const paragraphs = independent.map(item => short(item.date) + ': “' + item.note + '”');
    if (overlapping.length) paragraphs.push('Educational observations also appear in the dated gold-star highlights on ' +
      dates(overlapping.map(item => item.date)) + '.');
    add('Education & Skill Development', paragraphs);
  }

  // Every explicitly entered gold-star observation is retained, including
  // separate caregiver entries on the same day. Do not cap or deduplicate them.
  if (goldStarObservations.length) {
    add('Notable Observations and Experiences',
      goldStarObservations.map(item => short(item.date) + ': “' + item.note + '”'));
  } else {
    add('Notable Observations and Experiences', [
      'No entries were found in the dedicated gold-star observation field for this date range. Other positive experiences are summarized separately.'
    ]);
  }

  const strengths = [...new Set(a.days.flatMap(day => day.records.flatMap(record => record.values.strengths)))];
  const positive = a.notes.themes.find(t => t.name === 'positive experiences');
  const independent = a.notes.themes.find(t => t.name === 'independence and coping');
  if (strengths.length || positive?.dates.length || independent?.dates.length) {
    const parts = [];
    if (strengths.length) parts.push('Caregivers documented examples of coping, participation, or independence, including ' + strengths.slice(0, 6).map(key => key.replace(/_/g, ' ')).join(', ') + '.');
    const positiveQuote = quote(/\b(enjoyed|happy|successful|independent|greeted|good outing|went well|polite|excuse me|proud)\b/i, { max: 2, exclude: /\b(anxiety|worried|tired|snappy|did sleep|sleep good|orchard|apple)\b/i });
    if (positiveQuote) parts.push(positiveQuote);
    if (!parts.length) parts.push('Caregiver notes included positive experiences and moments of participation during this period.');
    add('Strengths and Positive Experiences', parts);
  }

  const prnDays = [...new Set(a.prnEntries.map(e => e.date))];
  // Preserve the recorded details of medication/regimen updates, not only dates.
  // An explicitly written update should remain visible even if its change flag was left blank.
  const medicationUpdates = a.days.flatMap(day => day.records.map(({ row }) => {
    const data = p(row);
    const changeFlag = bool(data.med_change_flag) === true;
    const name = String(data.med_change_name || '').trim();
    const dose = String(data.med_change_dose || '').trim();
    const note = String(data.med_change_note || '').trim();
    const time = String(data.med_change_time_other || data.med_change_time_window || '').trim();
    if (!changeFlag && !name && !dose && !note) return null;
    return {
      date: day.date, name, dose, note, time, changeFlag,
      stopped: bool(data.med_change_type_stopped) === true,
      doseChanged: bool(data.med_change_type_dose) === true,
      started: bool(data.med_change_type_new) === true,
    };
  }).filter(Boolean));
  // Associate a follow-up note lacking the name field with an explicitly named
  // medication only when the original text actually mentions that medication.
  const knownMedications = [...new Set(medicationUpdates.map(item => item.name).filter(Boolean))];
  const medicationGroups = new Map();
  for (const update of medicationUpdates) {
    const name = update.name || knownMedications.find(candidate =>
      update.note.toLowerCase().includes(candidate.toLowerCase())) || 'Unspecified medication';
    const key = name.toLowerCase().replace(/\s+/g, ' ');
    if (!medicationGroups.has(key)) medicationGroups.set(key, { name, updates: [] });
    medicationGroups.get(key).updates.push(update);
  }
  const medicationTimeline = [];
  for (const { name, updates } of medicationGroups.values()) {
    const lines = [], used = new Set(), seenActions = new Set();
    for (const item of updates) {
      const note = item.note;
      const isFollowUp = /\b(?:\d+(?:st|nd|rd|th)?\s+(?:morning|day|night)|follow.?up|since|after\s+the\s+(?:change|decrease))\b/i.test(note);
      const stopText = /\b(?:discontinu(?:e|ed|ing)|stopp(?:ed|ing))\b/i.test(note)
        && !/\b(?:stopping|stopped)\s+(?:manic|cycles|symptoms|behavior|behaviour|episodes)\b/i.test(note);
      const decreaseText = /\b(?:decreas(?:e|ed|ing)|reduc(?:e|ed|ing)|lower(?:ed|ing)?)\b/i.test(note + ' ' + item.dose);
      const increaseText = /\b(?:increas(?:e|ed|ing)|rais(?:e|ed|ing))\b/i.test(note + ' ' + item.dose);
      const kind = isFollowUp ? 'follow-up'
        : (item.stopped || stopText) ? 'stopped'
        : (item.doseChanged || decreaseText || increaseText) ? 'dose'
        : item.started ? 'started' : 'observation';
      // Multiple check-ins may describe the same stop or start. Include the
      // event only once, and retain separate dated observations as follow-ups.
      const actionKey = kind === 'stopped' || kind === 'started' ? kind : kind === 'dose'
        ? 'dose:' + item.dose.toLowerCase().replace(/\s+/g, ' ') : '';
      const duplicateAction = actionKey && seenActions.has(actionKey);
      if (actionKey) seenActions.add(actionKey);
      // A repeated "discontinued X" entry from another caregiver is not a
      // second medication stop. Keep distinct clinical details, not a second
      // rendering of the exact same stop statement.
      const repeatedStopOnly = duplicateAction && kind === 'stopped' &&
        /^\s*(?:discontinu(?:e|ed|ing)|stopp(?:ed|ing))\s+(?:the\s+)?(?:medication\s+)?[\w -]+[.!]?\s*$/i.test(note) &&
        !/\b(?:because|due to|after|since|for|side effect|reaction|concern|improv)\b/i.test(note);
      if (repeatedStopOnly) continue;
      const label = kind === 'stopped' && !duplicateAction ? 'discontinued'
        : kind === 'started' && !duplicateAction ? 'started'
        : kind === 'dose' && !duplicateAction ? 'dose adjustment'
        : 'follow-up/observation';
      const context = [
        label !== 'follow-up/observation' && item.dose ? item.dose : '',
        item.time && (label !== 'follow-up/observation' || name === 'Unspecified medication') ? 'at ' + formatCaregiverClockTime(item.time) : '',
        note && !isGoldStarRepeat(item.date, note) && !bedtimeRegimenQuoted(item.date, note) ? '“' + note + '”' : '',
      ].filter(Boolean).join(' — ');
      // If the full bedtime note has already appeared in Sleep and Energy,
      // omit a content-free "follow-up/observation" line in this section.
      if (!context && label === 'follow-up/observation' && bedtimeRegimenQuoted(item.date, note)) continue;
      const entry = short(item.date) + ': ' + label + (context ? ' — ' + context : '');
      if (!used.has(entry)) { used.add(entry); lines.push(entry); }
    }
    if (lines.length) medicationTimeline.push(name + ': ' + lines.join('; ') + '.');
  }
  const med = [];
  if (prnDays.length) {
    med.push('Caregivers documented that PRN medications were administered on ' + prnDays.length + ' different ' + (prnDays.length === 1 ? 'day' : 'days') + ': ' + dates(prnDays) + '. Multiple administrations on the same date are counted as one calendar day.');
    // Categorize using the entered reason, not nearby behavior notes.
    // Preserve every entered reason and time for clinical review.
    const categories = [
      ['Anxiety', /\b(anxiety|anxious|worried|worry|panic|fear|nervous)\b/i],
      ['Irritability or agitation', /\b(irritab\w*|agitat\w*|snapp\w*|aggress\w*|anger|angry|upset|restless|pacing|paced|escalat\w*)\b/i],
      ['Difficulty settling or sleeping', /\b(sleep\w*|insomnia|awake|settle|settling|bedtime|nighttime|night waking)\b/i],
      ['Pain or physical discomfort', /\b(pain|discomfort|headache|migraine|sore|stomach|tummy|nausea|aching|aches?)\b/i],
      ['Manic symptoms', /\b(mania|manic|cycling)\b/i],
    ];
    const reasonGroups = new Map();
    const perDate = new Map();
    for (const entry of a.prnEntries) {
      const detail = entry.item || {};
      const reason = String(detail.reason || '').trim();
      const medication = String(detail.medication || '').trim();
      const time = String(detail.time || '').trim();
      const notes = String(detail.notes || '').trim();
      const matches = categories.filter(([, pattern]) => pattern.test(reason)).map(([label]) => label);
      // If unmatched, preserve precisely what was entered instead of
      // suggesting anxiety, sleep problems, or any other unrecorded cause.
      const labels = matches.length ? matches : [reason ? (reason.toLowerCase() === 'other' ? 'Other reason (unspecified)' : 'Other: ' + reason) : 'Reason not recorded'];
      for (const label of labels) {
        if (!reasonGroups.has(label)) reasonGroups.set(label, new Set());
        reasonGroups.get(label).add(entry.date);
      }
      const words = [
        medication || 'medication unspecified',
        time ? 'at ' + formatCaregiverClockTime(time) : 'time not recorded',
        reason ? 'recorded reason: ' + reason : 'reason not recorded',
      ];
      if (notes && includeQuotes && notes.toLowerCase() !== reason.toLowerCase() &&
          !isGoldStarRepeat(entry.date, notes) && !bedtimeRegimenQuoted(entry.date, notes)) {
        words.push('note: “' + notes + '”');
      }
      if (!perDate.has(entry.date)) perDate.set(entry.date, []);
      perDate.get(entry.date).push(words.join(', '));
    }
    if (reasonGroups.size) {
      med.push('Reasons caregivers recorded for PRN use (a day can belong to more than one category):');
      for (const [label, daySet] of reasonGroups) {
        med.push(label + ': ' + dates([...daySet]) + '.');
      }
    }
    if (perDate.size) {
      med.push('Individual PRN entries, including medication, time, and the recorded reason:');
      for (const [date, descriptions] of [...perDate].sort(([a], [b]) => a.localeCompare(b))) {
        med.push(short(date) + ': ' + descriptions.join('; ') + '.');
      }
    }
  } else if (a.metrics.prn.dates.length) med.push('Caregivers reported PRN use on ' + dates(a.metrics.prn.dates) + '; individual administration details were not available for these dates.');
  // Medication changes have their own prominent section, not a trailing line
  // after a potentially long PRN administration log.
  add('Medication and PRN Observations', med);
  if (medicationTimeline.length) {
    const intro = sections.findIndex(section => section.startsWith('We would like to share observations'));
    sections.splice(intro >= 0 ? intro + 1 : 2, 0,
      'Medication Changes\n' + medicationTimeline.join('\n\n'));
  }

  sections.push('We hope this summary provides a useful picture of daily experiences, challenges, activities, and successes during this period. Thank you for taking the time to review these caregiver observations.');
  const covered = new Set(a.days.map(day => day.date));
  const missing = [];
  for (let day = ordinal(a.start); day <= ordinal(a.end); day++) {
    const key = new Date(day * DAY).toISOString().slice(0, 10);
    if (!covered.has(key)) missing.push(key);
  }
  if (missing.length) sections.push('Record coverage\nNo caregiver records were available for ' + dates(missing) + '.');
  return sections.join('\n\n');
}
