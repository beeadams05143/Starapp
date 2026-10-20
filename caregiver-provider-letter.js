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
  const sections = [];
  const add = (title, text) => sections.push(`${title}\n${text}`);
  add('Overall Progress', `This caregiver report covers ${dateLabel(a.start)} through ${dateLabel(a.end)}: ${a.rows.length} check-ins across ${a.days.length} unique dates. ${a.missingDays} dates have no check-in in the loaded records; missing dates are not assumed to be symptom-free. ${a.multipleEntryDays} dates have multiple check-ins.${a.duplicateCopies ? ` ${a.duplicateCopies} repeated copies of the same record were excluded.` : ''}${a.undated ? ` ${a.undated} undated records could not be placed in the period.` : ''}${a.dateConflicts ? ` ${a.dateConflicts} records have conflicting database and selected payload dates and were excluded pending date review.` : ''}${!a.individualId ? ' These records have no individual identifier; the caregiver must confirm they concern the same person before sharing.' : ''}${a.historical ? ` ${a.historical} historical check-ins may not distinguish blank answers from negative answers. Ambiguous engagement, appetite, and PRN values are excluded from negative counts.` : ''} Positive experiences and difficulties are described below. Different observers and incomplete answers limit comparisons.`);
  const sleep = a.metrics.sleep;
  let sleepText = sleep.answered || sleep.mixed ? evidenceSentence('Sleep difficulty or night waking', sleep) : 'There are not enough explicit sleep observations to describe a pattern.';
  if (a.sleepGaps.length) sleepText += ` Gaps between recorded episodes were ${a.sleepGaps.join(', ')} calendar days. ${a.regularSpacing ? 'The recorded spacing was similar across at least three intervals.' : 'There is insufficient evidence of regular recurrence.'} This does not establish a sleep cycle; unobserved days may contain other episodes.`;
  if (a.sleepClusters) sleepText += ` ${a.sleepClusters} pairs of sleep-difficulty dates were consecutive.`;
  const f = a.following;
  if (f.afterSleep.total) sleepText += ` Reduced engagement was recorded on the following selected date in ${f.afterSleep.reduced} of ${f.afterSleep.total} evaluable pairs after sleep difficulty, compared with ${f.afterNoSleep.reduced} of ${f.afterNoSleep.total} pairs after an explicitly negative sleep observation. ${f.excluded} pairs lacked an interpretable following-date observation. ${Math.min(f.afterSleep.total, f.afterNoSleep.total) < 5 ? 'The comparison is too sparse to support an association.' : 'This is a descriptive comparison, not evidence that sleep caused a change.'} The form does not establish which overnight interval each sleep answer describes.`;
  add('Sleep and Daily Rhythms', sleepText);
  const mood = ['engagement', 'withdrawal', 'pacing', 'irritability', 'attention', 'behavior'].filter(key => a.metrics[key].positive || a.metrics[key].mixed).map(key => evidenceSentence(LABELS[key], a.metrics[key]));
  if (a.cooccurring.length) mood.push(`Sleep difficulty and at least one engagement, pacing, irritability, or attention concern were recorded together on ${a.cooccurring.length} dates. Their order within the day is not established.`);
  for (const c of a.comparisons) {
    const direction = c.last.positive / c.last.answered < c.first.positive / c.first.answered ? 'less often' : c.last.positive / c.last.answered > c.first.positive / c.first.answered ? 'more often' : 'at the same proportion';
    mood.push(`${LABELS[c.key]} was reported ${direction} in the later equal-length window (${c.last.positive}/${c.last.answered} answered dates, versus ${c.first.positive}/${c.first.answered} earlier). This describes recorded observations, not an established clinical change.`);
  }
  if (!a.comparisons.length) mood.push('There are insufficient answered dates in comparable windows to establish improvement or worsening over time.');
  add('Mood and Engagement', mood.join(' ') || 'Mood and engagement observations are insufficient for a pattern.');
  const prnDays = [...new Set(a.prnEntries.map(entry => entry.date))];
  const prnSleep = prnDays.filter(date => a.metrics.sleep.dates.includes(date)).length;
  const medicationDates = a.days.filter(day => day.records.some(record => record.values.medicationChange === true)).map(day => day.date);
  add('Medication and Observations', `${a.prnEntries.length} structured PRN administration entries were recorded on ${prnDays.length} dates. ${a.metrics.prn.positive} dates reported PRN use, including any reports without itemized administrations.${a.metrics.prn.mixed ? ` Another ${a.metrics.prn.mixed} dates had conflicting PRN answers.` : ''}${a.possibleRepeatedPrn ? ` ${a.possibleRepeatedPrn} entries have matching date/medication/time/reason details and may describe the same administration; the number of distinct administrations is uncertain.` : ''}${prnSleep ? ` PRN entries and sleep difficulty were recorded on the same ${prnSleep} dates; sequence and medication effect cannot be inferred.` : ''}${medicationDates.length ? ` Medication changes were reported on ${medicationDates.map(dateLabel).join(', ')}; their effects cannot be determined from these reports.` : ''} Missing PRN answers do not mean no medication was given. ${a.metrics.appetite.answered || a.metrics.appetite.mixed ? evidenceSentence('Appetite change', a.metrics.appetite) : 'Appetite observations are insufficient for a trend.'}`);
  const repeated = a.notes.themes.filter(theme => theme.dates.length >= 2);
  const themeText = repeated.map(theme => `Notes mention ${theme.name} on ${theme.dates.length} dates${theme.distinctWording === 1 ? '; the wording is repeated and may have been copied forward' : ''}.`).join(' ');
  const quotes = a.notes.quotes.filter(q => q.themes.length).slice(0, 4);
  add('Caregiver Notes', `${themeText || 'No repeated note theme was identified confidently by the conservative text rules.'} These rules may miss nuance. ${includeQuotes ? quotes.map(q => `${dateLabel(q.date)}: “${q.quote}”`).join(' ') || 'No brief, confidently classified excerpts were selected.' : 'Direct quotations were excluded for privacy review.'}`);
  const positive = a.notes.themes.filter(theme => ['positive experiences', 'independence and coping'].includes(theme.name));
  const engagedDates = a.days.filter(day => day.engagement === false).length;
  const skills = new Set(a.days.filter(day => day.records.some(record => record.values.strengths.length)).map(day => day.date));
  add('Strengths and Successes', `${engagedDates ? `Engagement was explicitly recorded without reduction on ${engagedDates} dates. ` : ''}${skills.size ? `Positive coping or daily skills were recorded on ${skills.size} dates. ` : ''}${positive.map(theme => `Notes describe ${theme.name} on ${theme.dates.map(dateLabel).join(', ')}.`).join(' ') || 'The available notes do not support a specific positive theme; this does not mean positive experiences were absent.'} Isolated successful days do not by themselves establish sustained improvement.`);
  const questions = [];
  if (sleep.positive) questions.push('What additional sleep timing observations would help clarify the recorded sleep difficulties?');
  if (f.afterSleep.total) questions.push('Would consistently recording engagement on the calendar date after a sleep observation help assess the apparent sequence?');
  if (a.metrics.prn.positive) questions.push('What observations before and after the recorded PRN use would be useful to document?');
  if (a.days.some(day => METRICS.some(key => day[key] === 'mixed'))) questions.push('Could different observation times or settings help explain the conflicting same-date reports?');
  if (positive.length) questions.push('How could the activities and supports described on successful days inform daily planning?');
  if (!questions.length) questions.push('Which observations would be most useful to record more consistently before the next review?');
  add('Questions for the Provider', questions.join(' '));
  return `Dear Healthcare Provider,\n\n${sections.join('\n\n')}\n\nPrepared from caregiver-entered observations for caregiver review and discussion with the provider. This report does not establish a diagnosis or medical causation.`;
}
