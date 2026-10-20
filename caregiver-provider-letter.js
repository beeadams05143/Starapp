import { checkinDateKey, normalizeCheckinDate, formatCheckinDate } from './caregiver-dates.js';
import { optionalYesNo, optionalEngagement } from './caregiver-answer-quality.js';

const DAY = 86400000;
const ordinal = key => Date.parse(`${key}T12:00:00Z`) / DAY;
const dateLabel = key => formatCheckinDate(key, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const bool = value => optionalYesNo(value) === 'yes' ? true : optionalYesNo(value) === 'no' ? false : null;
const list = value => {
  if (Array.isArray(value)) return value;
  try { const result = JSON.parse(value); return Array.isArray(result) ? result : []; } catch { return []; }
};
export const NOTE_FIELDS = [
  'caregiver_notes', 'physical_notes', 'behavior_notes', 'mood_regulation_notes',
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
  const fullDate = key => new Date(key + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const dateList = keys => [...new Set(keys)].sort().map(fullDate).join('; ');
  const sections = ['Dear Support Team,'];
  const add = (title, text) => { if (text.trim()) sections.push(title + '\n' + text.trim()); };
  const p = row => row.payload ?? row;
  const active = (row, field) => bool(p(row)[field]) === true;
  const values = value => {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    if (typeof value !== 'string' || !value.trim()) return [];
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String); } catch {}
    return value.split(/[,;|]/).map(part => part.trim()).filter(Boolean);
  };
  const activity = (flag, type) => {
    const days = [];
    const descriptions = new Map();
    for (const day of a.days) {
      const participating = day.records.filter(({ row }) => active(row, flag));
      if (!participating.length) continue;
      days.push(day.date);
      const types = [...new Set(participating.flatMap(({ row }) => values(p(row)[type])))].filter(t => t.toLowerCase() !== 'other');
      if (types.length) descriptions.set(day.date, types.join(', '));
    }
    return { days, descriptions };
  };
  const examples = (pattern, max = 3) => {
    if (!includeQuotes) return '';
    const found = [];
    const usedDates = new Set(), usedTopics = new Set();
    for (const q of a.notes.quotes) {
      if (!q.date || !pattern.test(q.quote) || q.quote.trim().length > 190 || usedDates.has(q.date)) continue;
      if (/\b(will|planned|tomorrow|didn't|did not|refused)\b/i.test(q.quote)) continue;
      const lower = q.quote.toLowerCase();
      const topic = /apple|orchard/.test(lower) ? 'orchard' : /work|job/.test(lower) ? 'work' : /walk/.test(lower) ? 'walk' : /music|sing/.test(lower) ? 'music' : lower.replace(/[^a-z]/g, '').slice(0, 25);
      if (usedTopics.has(topic)) continue;
      found.push('On ' + fullDate(q.date) + ', a caregiver wrote, “' + q.quote.trim() + '”');
      usedDates.add(q.date); usedTopics.add(topic);
      if (found.length >= max) break;
    }
    return found.length ? ' ' + found.join(' ') : '';
  };
  sections.push('We would like to share observations from the caregiver records for ' + fullDate(a.start) + ' through ' + fullDate(a.end) + '. This summary describes sleep, mood, engagement, medication, vocational activities, community participation, and daily experiences. It brings together observations from all caregivers to provide a picture of the period as a whole.');
  const sleepDates = a.metrics.sleep.dates;
  if (sleepDates.length) {
    let text = 'Sleep difficulties or waking during the night were documented on ' + dateList(sleepDates) + '.';
    const fatigue = a.notes.quotes.filter(q => /\b(tired|fatigue|exhausted|low energy|slept well|little sleep)\b/i.test(q.quote));
    const selected = fatigue.filter(q => q.date && q.quote.length <= 200).slice(0, 3);
    if (includeQuotes && selected.length) text += ' Caregiver notes also described changes in energy. ' + selected.map(q => 'On ' + fullDate(q.date) + ', a caregiver wrote, “' + q.quote.trim() + '”').join(' ');
    text += ' The records describe periods of disrupted sleep and changes in energy, but do not establish a fixed recurring cycle.';
    add('Sleep and Changes in Energy', text);
  }
  const behavior = [];
  for (const [key, label] of [['engagement', 'Reduced engagement'], ['withdrawal', 'Withdrawal'], ['pacing', 'Pacing or restlessness'], ['irritability', 'Irritability'], ['attention', 'Difficulty maintaining attention']]) {
    const days = a.metrics[key].dates;
    if (days.length) behavior.push(label + ' was recorded on ' + dateList(days) + '.');
  }
  if (behavior.length) add('Mood, Engagement, and Behavioral Regulation', 'Caregiver observations describe changes in engagement and behavior during the period.\n' + behavior.join('\n') + examples(/\b(pacing|paced|restless|irritab|snappy|withdrawn|engag)/i, 2));
  const vocational = activity('vocational_participation', 'vocational_activity_type');
  if (vocational.days.length) add('Vocational Participation', 'Vocational participation was recorded on ' + dateList(vocational.days) + '.' + [...vocational.descriptions].map(([day, desc]) => ' On ' + fullDate(day) + ': ' + desc + '.').join('') + examples(/\b(work|job|vocational|employment|job coach)\b/i, 2));
  const home = activity('home_activity_flag', 'home_activity_type');
  const community = activity('public_activity_flag', 'public_activity_type');
  if (home.days.length || community.days.length) {
    let text = '';
    if (home.days.length) text += 'Home and family community activities were recorded on ' + dateList(home.days) + '. ' + [...home.descriptions].map(([day, desc]) => 'On ' + fullDate(day) + ': ' + desc + '.').join(' ');
    if (community.days.length) text += (text ? '\n' : '') + 'Community-at-large activities were recorded on ' + dateList(community.days) + '. ' + [...community.descriptions].map(([day, desc]) => 'On ' + fullDate(day) + ': ' + desc + '.').join(' ');
    add('Community and Family Participation', text.trim() + examples(/\b(orchard|outing|shopping|store|library|restaurant|pizza|park|walk|community)\b/i, 3));
  }
  const positive = a.notes.themes.find(t => t.name === 'positive experiences');
  const independence = a.notes.themes.find(t => t.name === 'independence and coping');
  const positiveDates = [...new Set([...(positive?.dates || []), ...(independence?.dates || [])])];
  if (positiveDates.length) add('Strengths and Positive Experiences', 'Caregivers described positive moments and examples of independence on ' + dateList(positiveDates) + '.' + examples(/\b(enjoyed|happy|good|successful|independent|greeted|conversation|ordered|participat)/i, 3));
  const prnDays = [...new Set(a.prnEntries.map(e => e.date))];
  const changes = a.days.filter(day => day.records.some(({ values }) => values.medicationChange === true)).map(day => day.date);
  const med = [];
  if (prnDays.length) med.push('PRN medication entries were documented on ' + dateList(prnDays) + '. More than one caregiver may have recorded information for the same date.');
  else if (a.metrics.prn.dates.length) med.push('PRN medication use was noted on ' + dateList(a.metrics.prn.dates) + '.');
  if (changes.length) med.push('Medication changes were noted on ' + dateList(changes) + '.');
  if (med.length) add('Medication and PRN Observations', med.join(' '));
  const covered = new Set(a.days.map(day => day.date)), missing = [];
  for (let day = ordinal(a.start); day <= ordinal(a.end); day++) {
    const date = new Date(day * DAY).toISOString().slice(0, 10);
    if (!covered.has(date)) missing.push(date);
  }
  sections.push('We hope this overview helps everyone involved in supporting the individual understand his experiences, challenges, activities, and successes during this period. Thank you for reviewing these observations with us.');
  if (missing.length) sections.push('Record coverage\nNo caregiver check-in was found for ' + dateList(missing) + '. These dates are not evidence that no activities or concerns occurred.');
  return sections.join('\n\n');
}
