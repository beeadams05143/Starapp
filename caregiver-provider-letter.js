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
  const blocks = ['Dear Healthcare Provider,'];
  const fmt = dates => [...new Set(dates)].sort().map(dateLabel).join(', ');
  const quote = (themes, limit = 2) => {
    if (!includeQuotes) return '';
    const seen = new Set();
    const selected = a.notes.quotes.filter(q => q.date && q.themes.some(t => themes.includes(t)) && q.quote.trim().length >= 12 && q.quote.trim().length <= 200).filter(q => {
      const key = q.date + q.quote.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit);
    return selected.length ? ' Caregiver notes provide examples: ' + selected.map(q => 'On ' + dateLabel(q.date) + ', a caregiver wrote, “' + q.quote.trim() + '”').join(' ') : '';
  };
  const section = (title, body) => { if (body.trim()) blocks.push(title + '\n' + body.trim()); };
  blocks.push('I am sharing a summary of observations documented by caregivers between ' + dateLabel(a.start) + ' and ' + dateLabel(a.end) + '. The goal is to give the treatment team a clearer picture of daily experiences, areas of concern, and positive moments that may be helpful during our next discussion.');
  const sleep = a.metrics.sleep;
  if (sleep.positive) {
    let body = 'Caregivers specifically documented difficulty falling asleep or waking during the night on ' + fmt(sleep.dates) + '. Sleep questions had interpretable answers on ' + sleep.answered + ' of the ' + a.days.length + ' dates with check-ins, so these are documented examples rather than a complete picture of sleep throughout the period.';
    body += ' We would appreciate guidance about which sleep details to track consistently, particularly when sleep disruption occurs alongside changes in daytime activity or engagement.';
    section('Sleep and Energy', body);
  } else {
    section('Sleep and Energy', 'The available check-ins do not provide enough clearly answered sleep questions to describe a reliable pattern for this period.');
  }
  const concerns = [
    ['engagement', 'reduced engagement'], ['withdrawal', 'withdrawal'], ['pacing', 'pacing or restlessness'],
    ['irritability', 'irritability'], ['attention', 'difficulty maintaining attention']
  ].filter(([key]) => a.metrics[key].positive > 0);
  let mood = '';
  if (concerns.length) {
    mood = 'Caregivers described concerns involving ' + concerns.map(([, name]) => name).join(', ') + '. ';
    const pacing = a.metrics.pacing;
    if (pacing.positive) mood += 'Pacing or restlessness was recorded on ' + fmt(pacing.dates) + '. ';
    mood += 'These observations may help the team understand what daily functioning has looked like during this period.';
  } else mood = 'The available structured answers do not establish a consistent pattern of behavioral or engagement concerns.';
  mood += quote(['pacing or restlessness', 'reduced participation']);
  section('Mood, Engagement, and Behavior', mood);
  const positives = a.notes.themes.find(t => t.name === 'positive experiences');
  let strengths = positives?.dates.length ? 'Caregivers also documented positive experiences on ' + fmt(positives.dates) + '. ' : '';
  strengths += quote(['positive experiences', 'independence and coping']);
  if (!strengths.trim()) strengths = 'The available notes contain limited detail about activities and successful moments during this period. Recording these alongside concerns may help provide a more balanced picture.';
  section('Participation and Positive Experiences', strengths);
  const prnDates = [...new Set(a.prnEntries.map(e => e.date))].sort();
  let medication = '';
  if (a.prnEntries.length) medication = 'Caregivers recorded ' + a.prnEntries.length + ' itemized PRN medication entries on ' + prnDates.length + ' dates: ' + fmt(prnDates) + '. These are recorded entries, not necessarily distinct administrations.';
  else if (a.metrics.prn.positive) medication = 'Caregivers indicated PRN medication use on ' + fmt(a.metrics.prn.dates) + ', although individual administration details were not available in these records.';
  else medication = 'The available check-ins do not contain itemized PRN administrations; this does not establish that no PRN medication was given.';
  if (a.possibleRepeatedPrn) medication += ' Some entries may refer to the same administration and should be verified.';
  const changes = a.days.filter(d => d.records.some(r => r.values.medicationChange === true)).map(d => d.date);
  if (changes.length) medication += ' Medication changes were flagged on ' + fmt(changes) + ', but the flags alone do not identify the medication, dose, or clinical effect.';
  medication += ' We would welcome the provider’s guidance on what information about timing, response, sleep, and daily functioning would be most useful when reviewing medications.';
  section('Medication and PRN Observations', medication);
  blocks.push('We hope these observations help support a conversation about what is going well, what has been difficult, and what we should continue monitoring. Thank you for reviewing them with us.');
  const caveats = [];
  caveats.push(a.rows.length + ' caregiver check-ins were recorded across ' + a.days.length + ' of the ' + a.totalDays + ' calendar days in the selected period');
  if (a.multipleEntryDays) caveats.push('on ' + a.multipleEntryDays + ' dates, more than one caregiver check-in was recorded; each caregiver’s observations were included in this summary');
  const recordedDates = new Set(a.days.map(day => day.date));
  const missingDates = [];
  for (let day = ordinal(a.start); day <= ordinal(a.end); day++) {
    const date = new Date(day * DAY).toISOString().slice(0, 10);
    if (!recordedDates.has(date)) missingDates.push(date);
  }
  if (missingDates.length) caveats.push('no caregiver check-in was found for ' + fmt(missingDates));
  if (a.dateConflicts) caveats.push(a.dateConflicts + ' record' + (a.dateConflicts === 1 ? ' was' : 's were') + ' excluded because its dates conflicted');
  if (a.historical) caveats.push('older check-ins may not distinguish unanswered questions from negative answers');
  blocks.push('About these records\n' + caveats.join('; ') + '. Days without check-ins are not evidence that no symptoms occurred. This letter summarizes caregiver observations and does not establish a diagnosis or medication effect.');
  return blocks.join('\n\n');
}
