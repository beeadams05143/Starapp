const DAY_MS = 86400000;

const BEHAVIOR_FIELDS = [
  {
    key: 'anxiety_signs_present',
    label: 'anxiety/worry signs',
    terms: ['anxiety', 'worry', 'tension', 'reassurance'],
    rowKeys: ['anxiety_signs_present'],
    payloadKeys: ['anxiety_signs_present'],
  },
  {
    key: 'withdrawal_present',
    label: 'withdrawal/low engagement',
    terms: ['withdrawal', 'withdrawn', 'disengaged', 'low motivation', 'low engagement'],
    rowKeys: ['withdrawal_present', 'disengaged_low_motivation_present'],
    payloadKeys: ['withdrawal_present', 'disengaged_low_motivation_present'],
  },
  {
    key: 'pressured_speech_present',
    label: 'pressured/rapid speech',
    terms: ['pressured speech', 'rapid speech', 'talking very fast', 'difficult to interrupt'],
    rowKeys: ['pressured_speech_present'],
    payloadKeys: ['pressured_speech_present'],
    positiveMoodValues: ['rapid_pressured', 'difficult_to_interrupt'],
  },
  {
    key: 'hyperactive_restless_present',
    label: 'pacing/restlessness',
    terms: ['pacing', 'restless', 'restlessness'],
    rowKeys: ['hyperactive_restless_present'],
    payloadKeys: ['hyperactive_restless_present'],
    positiveMoodValues: ['frequent', 'nearly_constant'],
  },
  {
    key: 'mood_irritability',
    label: 'irritability/emotional regulation concerns',
    terms: ['irritability', 'irritable', 'emotional regulation'],
    rowKeys: ['irritability_present'],
    payloadKeys: ['irritability_present'],
    positiveMoodValues: ['mild', 'moderate', 'significant'],
  },
  {
    key: 'mood_lability_present',
    label: 'rapid mood changes',
    terms: ['mood lability', 'rapid mood changes', 'big ups and downs'],
    rowKeys: ['mood_lability_present'],
    payloadKeys: ['mood_lability_present'],
  },
  {
    key: 'low_mood_indicators',
    label: 'low mood indicators',
    terms: ['low mood', 'sadness', 'tearfulness', 'reduced motivation'],
    rowKeys: ['low_mood_indicators'],
    payloadKeys: ['low_mood_indicators'],
  },
  {
    key: 'elevated_mood_indicators',
    label: 'elevated mood/energy indicators',
    terms: ['elevated mood', 'elevated energy', 'high energy'],
    rowKeys: ['elevated_mood_indicators'],
    payloadKeys: ['elevated_mood_indicators'],
  },
  {
    key: 'grandiose_statements_present',
    label: 'unrealistic or exaggerated beliefs/statements',
    terms: ['grandiose', 'exaggerated beliefs', 'big ideas'],
    rowKeys: ['grandiose_statements_present', 'grandiosity_present'],
    payloadKeys: ['grandiose_statements_present', 'grandiosity_present'],
  },
  {
    key: 'perseveration_present',
    label: 'repetitive behavior/perseveration',
    terms: ['perseveration', 'perseverative', 'repetitive', 'stuck on'],
    rowKeys: ['perseveration_present', 'repetitive_behavior_present', 'fixation_present'],
    payloadKeys: ['perseveration_present', 'repetitive_behavior_present', 'fixation_present'],
  },
  {
    key: 'focus_trouble_flag',
    label: 'attention/focus difficulty',
    terms: ['attention', 'focus', 'distractible', 'distractibility'],
    rowKeys: ['focus_trouble_flag', 'short_attention_span_present'],
    payloadKeys: ['focus_trouble_flag', 'short_attention_span_present'],
    positiveMoodValues: ['some_difficulty', 'very_difficult', 'distractible'],
  },
  {
    key: 'distress_impacts_participation',
    label: 'engagement/activation difficulty',
    terms: ['engagement', 'activation', 'participation'],
    rowKeys: ['distress_impacts_participation'],
    payloadKeys: ['distress_impacts_participation'],
  },
  {
    key: 'aggression_flag',
    label: 'aggression or safety concerns',
    terms: ['aggression', 'safety', 'unsafe', 'escalation'],
    rowKeys: ['aggression_flag'],
    payloadKeys: ['aggression_flag'],
  },
];

const NOTE_FIELD_KEYS = [
  'public_activity_note',
  'community_notes',
  'interaction_note',
  'home_notes',
  'vocational_notes',
  'behavior_notes',
  'mood_regulation_notes',
  'caregiver_notes',
];

function parseJsonishArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseMultiValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    } catch {}
    return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function hasProvidedValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function readValue(entry, keys = []) {
  const payload = entry?.payload || {};
  for (const key of keys) {
    if (hasProvidedValue(entry?.[key])) return entry[key];
    if (hasProvidedValue(payload[key])) return payload[key];
  }
  return null;
}

function triBool(value) {
  if (!hasProvidedValue(value)) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const normalized = String(value).trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'done', 'complete', 'completed'].includes(normalized)) return true;
  if (['no', 'n', 'false', '0', 'none', 'not selected'].includes(normalized)) return false;
  return null;
}

function pickMinutes(...values) {
  const durationMap = {
    '0': 0,
    '0 min': 0,
    '15-30 min': 30,
    '30-60 min': 60,
    '1-2 hrs': 120,
    '1 hr': 60,
    '2 hrs': 120,
    '2+ hrs': 150,
    'over 2 hrs': 150,
  };
  for (const value of values) {
    if (!hasProvidedValue(value)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const key = String(value).replace(/\u2013/g, '-').toLowerCase().replace(/\s+/g, ' ').trim();
    if (durationMap[key] !== undefined) return durationMap[key];
    const rangeMatch = key.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/);
    if (rangeMatch) return Math.round(Number(rangeMatch[2]) * (key.includes('hr') ? 60 : 1));
    const hoursMatch = key.match(/(\d+(?:\.\d+)?)\s*(?:hr|hour|hrs|hours)\b/);
    if (hoursMatch) return Math.round(Number(hoursMatch[1]) * 60);
    const minutesMatch = key.match(/(\d+(?:\.\d+)?)\s*(?:min|minute|minutes)\b/);
    if (minutesMatch) return Math.round(Number(minutesMatch[1]));
    const num = Number(key);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function getDayKey(entry = {}) {
  const value = entry.date || entry.payload?.entry_date || entry.payload?.date || entry.submitted_at || entry.created_at || '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function inclusiveRangeDays(range) {
  const start = range?.start instanceof Date ? range.start : range?.start ? new Date(range.start) : null;
  const end = range?.end instanceof Date ? range.end : range?.end ? new Date(range.end) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(1, Math.round((end - start) / DAY_MS) + 1);
}

function formatHours(minutes) {
  const hours = Math.max(0, Number(minutes) || 0) / 60;
  const rounded = Math.round(hours * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${rounded === 1 ? 'hour' : 'hours'}`;
}

function countEntriesWithMinutes(entries, getMinutes) {
  return entries.filter((entry) => (getMinutes(entry) || 0) > 0).length;
}

function communityMinutes(entry = {}) {
  const payload = entry.payload || {};
  const direct = pickMinutes(entry.community_time, entry.community_minutes, payload.community_time, payload.community_minutes);
  if (direct !== null) return direct;
  const home = pickMinutes(entry.home_time, entry.home_activity_time, payload.home_activity_time, payload.home_time, payload.home_minutes) || 0;
  const publicMinutes = pickMinutes(entry.public_time, entry.public_activity_time, payload.public_activity_time, payload.public_time, payload.public_minutes) || 0;
  return home + publicMinutes;
}

function vocationalMinutes(entry = {}) {
  const payload = entry.payload || {};
  return pickMinutes(entry.vocational_time, entry.vocational_minutes, payload.vocational_time, payload.vocational_minutes) || 0;
}

export function filterParentLetterEntries(entries = [], range = {}) {
  const startKey = range.startInput || '';
  const endKey = range.endInput || '';
  return entries.filter((entry) => {
    const dayKey = getDayKey(entry);
    if (!dayKey) return false;
    if (startKey && dayKey < startKey) return false;
    if (endKey && dayKey > endKey) return false;
    return true;
  });
}

export function summarizeParticipationForParentLetter(entries = [], range = {}, type = 'community') {
  const getMinutes = type === 'vocational' ? vocationalMinutes : communityMinutes;
  const totalMinutes = entries.reduce((sum, entry) => sum + getMinutes(entry), 0);
  const observedEntries = countEntriesWithMinutes(entries, getMinutes);
  const days = inclusiveRangeDays(range);
  const weeks = days ? days / 7 : null;
  const weeklyAverageHours = weeks && days >= 7 ? (totalMinutes / 60) / weeks : null;
  return {
    type,
    totalMinutes,
    totalHoursText: formatHours(totalMinutes),
    observedEntries,
    rangeDays: days,
    weeklyAverageHours,
    weeklyAverageText: weeklyAverageHours === null ? '' : formatHours(weeklyAverageHours * 60),
    shouldReportWeeklyAverage: weeklyAverageHours !== null,
  };
}

export function participationSentence(label, summary) {
  if (!summary || summary.totalMinutes <= 0) return '';
  const entryText = `${summary.observedEntries} caregiver check-in${summary.observedEntries === 1 ? '' : 's'}`;
  let sentence = `${label} participation totaled ${summary.totalHoursText} across the ${entryText} recorded during this reporting period.`;
  if (summary.shouldReportWeeklyAverage) {
    sentence += ` This equals ${summary.weeklyAverageText} per week over the ${summary.rangeDays}-day reporting period.`;
  }
  return sentence;
}

function trackingEntries(entry = {}) {
  return parseJsonishArray(entry.payload?.behavior_tracking ?? entry.behavior_tracking)
    .filter((item) => item && typeof item === 'object');
}

function behaviorTrackingValue(entry, field) {
  let sawApplicable = false;
  let sawYes = false;
  for (const item of trackingEntries(entry)) {
    const key = item.item_key || item.key || '';
    const name = String(item.behavior_name || item.label || '').toLowerCase();
    const matches = key === field.key || field.rowKeys.includes(key) || field.terms.some((term) => name.includes(term));
    if (!matches) continue;
    if (item.occurred === true || item.prn_used === true) sawYes = true;
    if (item.occurred === false || item.prn_used === false || item.occurred === true || item.prn_used === true) sawApplicable = true;
  }
  if (sawYes) return true;
  return sawApplicable ? false : null;
}

function moodDerivedValue(entry, field) {
  const payload = entry?.payload || {};
  if (field.key === 'pressured_speech_present' && hasProvidedValue(payload.mood_speech)) {
    return field.positiveMoodValues.includes(String(payload.mood_speech).trim().toLowerCase());
  }
  if (field.key === 'hyperactive_restless_present' && hasProvidedValue(payload.mood_pacing)) {
    return field.positiveMoodValues.includes(String(payload.mood_pacing).trim().toLowerCase());
  }
  if (field.key === 'focus_trouble_flag' && hasProvidedValue(payload.mood_attention)) {
    const value = String(payload.mood_attention).trim().toLowerCase();
    return value !== 'typical' && value !== 'none';
  }
  if (field.key === 'withdrawal_present' && hasProvidedValue(payload.mood_engagement_score ?? payload.mood_engagement)) {
    const score = Number(payload.mood_engagement_score ?? payload.mood_engagement);
    return Number.isFinite(score) ? score >= 2 : null;
  }
  if (field.key === 'mood_irritability' && hasProvidedValue(payload.mood_irritability)) {
    const value = String(payload.mood_irritability).trim().toLowerCase();
    return field.positiveMoodValues.includes(value);
  }
  return null;
}

function fieldValue(entry, field) {
  const direct = triBool(readValue(entry, [...field.rowKeys, ...field.payloadKeys]));
  if (direct !== null) return direct;
  const tracked = behaviorTrackingValue(entry, field);
  if (tracked !== null) return tracked;
  return moodDerivedValue(entry, field);
}

export function summarizeBehaviorForParentLetter(entries = []) {
  return BEHAVIOR_FIELDS.map((field) => {
    let yes = 0;
    let answered = 0;
    const days = new Set();
    entries.forEach((entry) => {
      const value = fieldValue(entry, field);
      if (value === null) return;
      answered += 1;
      if (value === true) {
        yes += 1;
        const day = getDayKey(entry);
        if (day) days.add(day);
      }
    });
    return { key: field.key, label: field.label, yes, answered, days: days.size };
  });
}

function cleanActivityLabel(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:;,.:-]+|[\s:;,.:-]+$/g, '')
    .trim();
}

function canonicalActivity(value) {
  return cleanActivityLabel(value)
    .toLowerCase()
    .replace(/^went to\s+/, '')
    .replace(/^trip to\s+/, '')
    .replace(/^a trip to\s+/, '')
    .replace(/^visited\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function noteSentences(entry = {}) {
  const payload = entry.payload || {};
  return NOTE_FIELD_KEYS.flatMap((key) => [entry[key], payload[key]])
    .filter(hasProvidedValue)
    .flatMap((value) => String(value).split(/(?:\n+|(?<=[.!?])\s+)/))
    .map(cleanActivityLabel)
    .filter(Boolean);
}

function activityFromNote(sentence) {
  const text = cleanActivityLabel(sentence);
  if (!text) return null;
  const match = text.match(/\b(?:went to|trip to|visited|attended|outing to)\s+([^.;\n]+?)(?:\s+(?:and|with|which|that)\b|$)/i);
  if (!match) return null;
  const activity = cleanActivityLabel(match[1]);
  if (!activity || activity.length < 3) return null;
  const successful = /\b(success|successful|went well|good outing|enjoyed|positive)\b/i.test(text);
  return { label: activity, source: 'note', successful };
}

export function collectNotableActivities(entries = []) {
  const items = [];
  const seen = new Set();
  const add = (label, source, successful = false) => {
    const clean = cleanActivityLabel(label);
    const key = canonicalActivity(clean);
    if (!key) return;
    const existing = items.find((item) => item.key === key);
    if (existing) {
      existing.sources.add(source);
      existing.successful = existing.successful || successful;
      return;
    }
    seen.add(key);
    items.push({ key, label: clean, sources: new Set([source]), successful });
  };
  entries.forEach((entry) => {
    const payload = entry.payload || {};
    parseMultiValue(entry.public_activity_type ?? payload.public_activity_type)
      .forEach((label) => add(label, 'structured'));
    noteSentences(entry).map(activityFromNote).filter(Boolean)
      .forEach((activity) => add(activity.label, activity.source, activity.successful));
  });
  void seen;
  return items.map((item) => ({
    label: item.label,
    sources: [...item.sources],
    successful: item.successful,
  }));
}

export function formatBehaviorFindings(findings = [], { includeNotableAbsence = true } = {}) {
  const positives = findings
    .filter((item) => item.yes > 0)
    .map((item) => `${item.label} on ${item.yes} of ${item.answered} applicable check-in${item.answered === 1 ? '' : 's'}`);
  const absences = includeNotableAbsence
    ? findings.filter((item) => item.answered > 0 && item.yes === 0).slice(0, 2)
    : [];
  const lines = positives.slice(0, 6);
  absences.forEach((item) => lines.push(`${item.label} was not noted in ${item.answered} applicable check-in${item.answered === 1 ? '' : 's'}`));
  return lines;
}
