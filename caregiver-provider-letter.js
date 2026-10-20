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
  const sections = ['Caregiver Observation Summary\\nDate Prepared: ' + prepared, 'Dear Support Team,'];
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
  // A quote belongs to one section only, even when its wording matches several.
  const usedQuotes = new Set();
  const quote = (pattern, { max = 1, exclude = null } = {}) => {
    if (!includeQuotes) return '';
    const selected = [], topics = new Set();
    for (const q of a.notes.quotes) {
      const value = q.quote.trim();
      if (!q.date || value.length > 180 || !pattern.test(value) || exclude?.test(value)) continue;
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
  const fatigue = a.notes.quotes.filter(q => /\b(tired|fatigue|exhausted|low energy|little sleep|did not sleep|didn't sleep)\b/i.test(q.quote));
  if (sleep.length || fatigue.length) {
    const paragraphs = [];
    if (sleep.length) paragraphs.push('Sleep difficulties or nighttime waking were recorded on ' + dates(sleep) + '.');
    const energyQuote = quote(/\b(tired|fatigue|exhausted|low energy|manic)\b/i, { max: 2, exclude: /\b(tummy|stomach|shots)\b/i });
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
    if (engagement.length) parts.push('Caregivers recorded changes in participation and engagement, including ' + engagement.map(([, label]) => label).join(' and ') + '. These observations appeared on multiple days during the reporting period.');
    if (regulation.length) parts.push('Other observations included ' + regulation.map(([, label]) => label).join(', ').replace(/, ([^,]*)$/, ', and $1') + '.');
    const behaviorQuote = quote(/\b(pacing|paced|restless|snappy|irritab|withdrawn|engag)\b/i, { max: 2 });
    if (behaviorQuote) parts.push(behaviorQuote);
    add('Mood, Engagement, and Behavior', parts);
  }

  const vocational = activity('vocational_participation', 'vocational_activity_type');
  if (vocational.days.length) {
    const parts = ['Vocational participation was documented on ' + vocational.days.length + ' different ' + (vocational.days.length === 1 ? 'day' : 'days') + ' during this period.'];
    if (vocational.types.size) parts.push('Recorded activities included ' + [...vocational.types.keys()].slice(0, 7).join(', ') + '.');
    const workNotes = a.notes.quotes.filter(q => q.date && /\b(work|job|maintenance|employment|job coach|vocational)\b/i.test(q.quote) && q.quote.trim().length <= 180 && !/\b(will|planned|tomorrow|did not|didn't)\b/i.test(q.quote));
    const distinctiveWork = workNotes.find(q => /\b(met|new|learned|helped|completed|independent|task|coach)\b/i.test(q.quote));
    if (distinctiveWork && includeQuotes) {
      parts.push('A specific workplace experience noted on ' + short(distinctiveWork.date) + ' was: “' + distinctiveWork.quote.trim() + '”');
      usedQuotes.add(distinctiveWork.date + ':' + distinctiveWork.quote.trim().toLowerCase());
    } else parts.push(quote(/\b(work|job|maintenance|employment|job coach)\b/i, { max: 1 }));
    add('Vocational Participation', parts);
  }

  // Highlight specific experiences in notes, rather than treating every routine
  // walk or store visit as equally notable. Match actual caregiver text only.
  const notableRules = [
    { id: 'orchard', pattern: /\b(orchard|apple picking|pumpkin patch)\b/i },
    { id: 'new-person', pattern: /\b(met (?:a |the )?new|new (?:person|staff|employee|maintenance|friend)|introduced (?:himself|herself|themselves))\b/i },
    { id: 'event', pattern: /\b(festival|fair|concert|show|museum|zoo|field trip|birthday party|holiday event|parade)\b/i },
    { id: 'social', pattern: /\b(greeted|said hello|made conversation|introduced himself|ordered (?:his|their|her) own|asked (?:for|someone))\b/i },
    { id: 'outing', pattern: /\b(yankee candle|christmas village|halloween village|library|farm|hiking trail|nature center)\b/i },
  ];
  const notable = [];
  const seenNotable = new Set();
  for (const q of a.notes.quotes) {
    if (!q.date || q.quote.trim().length > 180) continue;
    const value = q.quote.trim();
    if (/\b(will|tomorrow|planned|might|didn't|did not|refused)\b/i.test(value)) continue;
    const rule = notableRules.find(rule => rule.pattern.test(value));
    if (!rule || seenNotable.has(rule.id)) continue;
    notable.push({ date: q.date, value, id: rule.id });
    seenNotable.add(rule.id);
  }
  const home = activity('home_activity_flag', 'home_activity_type');
  const community = activity('public_activity_flag', 'public_activity_type');
  if (home.days.length || community.days.length) {
    const parts = [];
    const summarize = (name, data) => {
      if (!data.days.length) return '';
      const examples = [...data.types].sort((a, b) => b[1].size - a[1].size).slice(0, 7).map(([type]) => type);
      return name + ' was documented on ' + data.days.length + ' ' + (data.days.length === 1 ? 'day' : 'days') + (examples.length ? ', including ' + examples.join(', ') : '') + '.';
    };
    parts.push(summarize('At-home and family activities', home));
    parts.push(summarize('Participation in the wider community', community));
    if (notable.length) {
      const selected = notable.slice(0, 4);
      parts.push('Noteworthy experiences and social interactions described in caregiver notes included: ' + selected.map(item => short(item.date) + ' — “' + item.value + '”').join('; ') + '.');
      for (const item of selected) usedQuotes.add(item.date + ':' + item.value.toLowerCase());
    } else {
      parts.push(quote(/\b(orchard|outing|shopping|store|library|restaurant|pizza|park|walk|community)\b/i, { max: 1 }));
    }
    add('Community and Family Participation', parts);
  }

  const strengths = [...new Set(a.days.flatMap(day => day.records.flatMap(record => record.values.strengths)))];
  const positive = a.notes.themes.find(t => t.name === 'positive experiences');
  const independent = a.notes.themes.find(t => t.name === 'independence and coping');
  if (strengths.length || positive?.dates.length || independent?.dates.length) {
    const parts = [];
    if (strengths.length) parts.push('Caregivers documented examples of coping, participation, or independence, including ' + strengths.slice(0, 6).map(key => key.replace(/_/g, ' ')).join(', ') + '.');
    const positiveQuote = quote(/\b(enjoyed|happy|successful|independent|greeted|good outing|went well)\b/i, { max: 2, exclude: /\b(anxiety|worried|tired|snappy|did sleep|sleep good)\b/i });
    if (positiveQuote) parts.push(positiveQuote);
    if (!parts.length) parts.push('Caregiver notes included positive experiences and moments of participation during this period.');
    add('Strengths and Positive Experiences', parts);
  }

  const prnDays = [...new Set(a.prnEntries.map(e => e.date))];
  const changes = a.days.filter(day => day.records.some(record => record.values.medicationChange === true)).map(day => day.date);
  const med = [];
  if (prnDays.length) med.push('PRN medication entries appeared on ' + prnDays.length + ' different ' + (prnDays.length === 1 ? 'day' : 'days') + ', including ' + dates(prnDays) + '. These reflect caregiver documentation and may include more than one entry for a day.');
  else if (a.metrics.prn.dates.length) med.push('Caregivers reported PRN use on ' + dates(a.metrics.prn.dates) + '.');
  if (changes.length) med.push('Medication changes were noted on ' + dates(changes) + '.');
  add('Medication and PRN Observations', med);

  sections.push('We hope this summary provides a useful picture of daily experiences, challenges, activities, and successes during this period. Thank you for taking the time to review these caregiver observations.');
  const covered = new Set(a.days.map(day => day.date));
  const missing = [];
  for (let day = ordinal(a.start); day <= ordinal(a.end); day++) {
    const key = new Date(day * DAY).toISOString().slice(0, 10);
    if (!covered.has(key)) missing.push(key);
  }
  if (missing.length) sections.push('Record coverage\nThere were no caregiver records for ' + dates(missing) + '. This does not mean that no activities or concerns occurred on those days.');
  return sections.join('\n\n');
}
