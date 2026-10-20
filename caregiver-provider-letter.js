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
  const paragraphs = [];
  const section = (heading, content) => {
    if (content && content.trim()) paragraphs.push(heading + '\n' + content.trim());
  };
  const plural = (n, singular, multiple = singular + 's') => n === 1 ? singular : multiple;
  const observed = (metric, label) => metric.positive
    ? label + ' was documented on ' + metric.positive + ' of ' + metric.answered +
      ' dates with a clear answer.'
    : metric.answered
      ? label + ' was not documented on the ' + metric.answered + ' dates with a clear answer.'
      : '';
  const dateList = dates => dates.slice(0, 5).map(dateLabel).join(', ') +
    (dates.length > 5 ? ', and ' + (dates.length - 5) + ' additional dates' : '');
  const quoteText = quote => String(quote.quote || '').trim();
  const selectedQuotes = (themes, limit = 2) => {
    if (!includeQuotes) return '';
    const candidates = a.notes.quotes.filter(q => q.themes.some(t => themes.includes(t)) &&
      q.date && quoteText(q).length >= 12 && quoteText(q).length <= 200);
    const seen = new Set();
    const picked = candidates.filter(q => {
      const key = q.date + ':' + quoteText(q).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit);
    return picked.length ? ' Examples from the original caregiver notes include ' +
      picked.map(q => dateLabel(q.date) + ': “' + quoteText(q) + '”').join('; ') + '.' : '';
  };
  const counts = a.metrics;
  const coverage = a.rows.length + ' caregiver ' + plural(a.rows.length, 'check-in') +
    ' covering ' + a.days.length + ' distinct ' + plural(a.days.length, 'date');
  const limitations = [
    a.missingDays ? a.missingDays + ' dates in the selected period have no recorded check-in' : '',
    a.multipleEntryDays ? a.multipleEntryDays + ' dates contain more than one check-in' : '',
    a.dateConflicts ? a.dateConflicts + ' records with conflicting dates were excluded' : '',
    a.historical ? 'some older check-ins do not reliably distinguish unanswered questions from negative answers' : '',
  ].filter(Boolean);
  paragraphs.push('Dear Healthcare Provider,');
  paragraphs.push('This letter summarizes caregiver-documented observations from ' +
    dateLabel(a.start) + ' through ' + dateLabel(a.end) +
    ' to support discussion of daily functioning, changes over time, and questions for the care team. ' +
    'The available information includes ' + coverage + '. ' +
    (limitations.length ? 'For context, ' + limitations.join('; ') + '. ' : '') +
    'An unrecorded day should not be interpreted as a day without symptoms.');
  const sleep = counts.sleep;
  const sleepParts = [];
  if (sleep.positive) {
    sleepParts.push('Sleep difficulties or night waking were reported on ' +
      sleep.positive + ' of ' + sleep.answered + ' dates with a clear sleep answer' +
      (sleep.dates.length ? ', including ' + dateList(sleep.dates) : '') + '.');
    if (a.sleepClusters) sleepParts.push('Some recorded episodes occurred on consecutive dates.');
    if (a.sleepGaps.length >= 3) sleepParts.push(
      a.regularSpacing
        ? 'The spacing between recorded episodes was similar across several intervals, but the available records do not establish a fixed recurring cycle.'
        : 'The spacing between recorded episodes varied, and the available records do not establish a fixed recurring cycle.'
    );
  } else if (sleep.answered) {
    sleepParts.push('The check-ins with clear sleep answers did not record sleep difficulty during this period.');
  } else {
    sleepParts.push('There are not enough explicit sleep answers to characterize sleep patterns during this period.');
  }
  const f = a.following;
  if (f.afterSleep.total >= 2) {
    sleepParts.push('On the following documented calendar date, reduced engagement was noted in ' +
      f.afterSleep.reduced + ' of ' + f.afterSleep.total +
      ' evaluable instances after a recorded sleep difficulty. This is an observation about timing, not evidence that sleep caused the change.');
  }
  sleepParts.push('Additional consistent sleep and daytime observations may help the team understand whether these changes occur together.');
  section('Sleep and Changes in Energy', sleepParts.join(' '));

  const moodParts = [];
  const moodLabels = [
    ['engagement', 'Reduced engagement'],
    ['withdrawal', 'Marked withdrawal'],
    ['pacing', 'Pacing or restlessness'],
    ['irritability', 'Irritability'],
    ['attention', 'Difficulty sustaining attention'],
    ['behavior', 'Other tracked behavioral concerns'],
  ];
  const concerns = moodLabels.filter(([key]) => counts[key].positive > 0);
  if (concerns.length) moodParts.push(concerns.map(([key, label]) => observed(counts[key], label)).join(' '));
  else moodParts.push('The available structured answers do not establish a recurring concern in mood, engagement, or behavioral regulation.');
  if (a.cooccurring.length >= 2) moodParts.push('Sleep concerns and at least one engagement or behavioral concern appeared together on ' +
    a.cooccurring.length + ' recorded dates. The check-ins do not establish which occurred first.');
  const comparable = a.comparisons.filter(c => c.first.answered >= 7 && c.last.answered >= 7);
  if (comparable.length) {
    const notable = comparable.filter(c => Math.abs(c.last.positive / c.last.answered - c.first.positive / c.first.answered) >= 0.2);
    if (notable.length) moodParts.push('Comparing the earlier and later portions of the period, ' +
      notable.slice(0, 3).map(c => {
        const name = LABELS[c.key] || c.key;
        const direction = c.last.positive / c.last.answered > c.first.positive / c.first.answered ? 'more' : 'less';
        return name.toLowerCase() + ' was recorded ' + direction + ' often (' +
          c.first.positive + '/' + c.first.answered + ' earlier versus ' +
          c.last.positive + '/' + c.last.answered + ' later)';
      }).join('; ') + '. These comparisons describe documentation, not a confirmed clinical change.');
  }
  moodParts.push(selectedQuotes(['reduced participation', 'pacing or restlessness'], 2));
  section('Mood, Engagement, and Behavioral Regulation', moodParts.filter(Boolean).join(' '));

  const activityParts = [];
  const themes = a.notes.themes.filter(t => t.dates.length >= 2 &&
    ['reduced participation', 'independence and coping', 'positive experiences'].includes(t.name));
  if (themes.length) activityParts.push('Across the caregiver notes, ' + themes.map(t =>
    t.name + ' was described on ' + t.dates.length + ' distinct dates').join('; ') + '.');
  const engagedDays = a.days.filter(day => day.engagement === false).length;
  const strengthsDays = a.days.filter(day => day.records.some(r => r.values.strengths.length)).length;
  if (engagedDays) activityParts.push('Engagement without a recorded reduction was documented on ' +
    engagedDays + ' dates.');
  if (strengthsDays) activityParts.push('Caregivers also recorded positive coping or daily-living skills on ' +
    strengthsDays + ' dates.');
  activityParts.push(selectedQuotes(['positive experiences', 'independence and coping'], 2));
  if (!activityParts.filter(Boolean).length) activityParts.push('The available check-ins contain too little specific activity or coping information to identify a reliable pattern.');
  section('Daily Activities, Participation, and Strengths', activityParts.filter(Boolean).join(' '));

  const medicationParts = [];
  const prnDates = [...new Set(a.prnEntries.map(x => x.date))];
  if (a.prnEntries.length) medicationParts.push('The records include ' + a.prnEntries.length +
    ' itemized PRN medication ' + plural(a.prnEntries.length, 'entry', 'entries') +
    ' across ' + prnDates.length + ' dates' +
    (prnDates.length ? ' (' + dateList(prnDates) + ')' : '') + '.');
  else if (counts.prn.positive) medicationParts.push('PRN use was reported on ' +
    counts.prn.positive + ' dates, but the available records do not provide itemized administrations.');
  else medicationParts.push('No itemized PRN administrations were available in the selected check-ins; this does not establish that no PRN medication was used.');
  if (a.possibleRepeatedPrn) medicationParts.push('Some PRN entries have matching details and may refer to the same administration.');
  const medDates = a.days.filter(d => d.records.some(r => r.values.medicationChange === true)).map(d => d.date);
  if (medDates.length) medicationParts.push('Caregivers flagged medication changes on ' + dateList(medDates) + '.');
  if (counts.appetite.positive) medicationParts.push(observed(counts.appetite, 'Appetite changes'));
  medicationParts.push('These observations cannot establish medication effectiveness or causation; timing, dosing, and clinical interpretation should be reviewed with the prescribing provider.');
  section('Medication and PRN Observations', medicationParts.join(' '));

  const questions = [];
  if (sleep.positive) questions.push('What sleep details would be most helpful to document consistently?');
  if (concerns.length) questions.push('Which changes in engagement or behavior should prompt follow-up?');
  if (a.prnEntries.length || counts.prn.positive) questions.push('What observations before and after PRN use would help evaluate the response?');
  if (strengthsDays || engagedDays) questions.push('Which supports and activities appear to help on more successful days?');
  if (!questions.length) questions.push('Which daily observations would be most useful for the next review?');
  section('Questions for the Provider', questions.join(' '));

  paragraphs.push('This summary reflects caregiver-entered observations, not a diagnosis or a determination of cause. It is intended for review with the healthcare team.');
  return paragraphs.join('\n\n');
}
