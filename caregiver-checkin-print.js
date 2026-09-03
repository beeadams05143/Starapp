const NOTE_KEYS = new Set([
  'caregiver_notes', 'notes', 'physical_notes', 'behavior_notes', 'vocational_notes',
  'home_activity_note', 'home_notes', 'pet_activity_note', 'pet_activity_notes',
  'public_activity_note', 'interaction_note', 'adl_note', 'daily_living_notes',
  'aggression_notes', 'behavior_anomaly_notes', 'movement_notes',
  'movement_interfered_notes', 'movement_safety_notes', 'temp_notes',
  'menstrual_notes', 'med_change_note',
]);

const LABELS = {
  entry_date: 'Date of shift', date: 'Date of shift', submitted_at: 'Submitted', created_at: 'Created',
  updated_at: 'Last updated', caregiver_name: 'Caregiver', had_bm: 'BM',
  hygiene: 'Hygiene', food_prep: 'Food prep', cleanup: 'Cleaning', new_skill_score: 'Independence',
  adl_entries: 'ADL activities', adl_category: 'ADL categories', adl_activity: 'ADL activities',
  adl_note: 'ADL note', prompting_level: 'Prompting / independence', daily_living_notes: 'Daily living notes',
  prn_used_today: 'PRN used', prn_entries: 'PRN administrations', prn_count: 'PRN count',
  vocational_participation: 'Vocational', vocational_time: 'Duration', vocational_prompting: 'Prompting',
  vocational_activity_type: 'Activity', vocational_notes: 'Vocational notes',
  home_activity_flag: 'Home activity', home_activity_time: 'Duration', home_activity_prompting: 'Prompting',
  home_activity_type: 'Activity', home_activity_note: 'Home note', home_notes: 'Home / family notes',
  pet_interaction_flag: 'Pet interaction', pet_activity_type: 'Pet activity', pet_activity_note: 'Pet note',
  pet_activity_notes: 'Pet notes', public_activity_flag: 'Community', public_activity_time: 'Duration',
  public_activity_prompting: 'Prompting', public_activity_type: 'Activity', public_activity_note: 'Community note',
  community_interaction_ok: 'Interaction', interaction_type: 'Interaction type',
  interaction_prompting: 'Prompting', interaction_note: 'Interaction note', community_time: 'Community minutes',
  appears_good_health: 'Good health', appears_tired: 'Tired', hours_sleep: 'Sleep',
  sleep_fell_asleep_time: 'Fell asleep', sleep_onset_time: 'Fell asleep',
  sleep_onset_difficulty: 'Sleep onset difficulty', night_wake_flag: 'Night waking',
  night_waking: 'Night waking', night_wake_count: 'Night wakings',
  appetite_change_flag: 'Appetite change', appetite_change_direction: 'Appetite',
  med_change_flag: 'Medication change', med_change_name: 'Medication', med_change_dose: 'Dose / change',
  med_change_note: 'Medication notes', movement_present: 'Movement/vocalization',
  movement_main_type: 'Movement type', movement_severity: 'Severity', movement_times: 'Times',
  movement_notes: 'Movement notes', temp_present: 'Illness/discomfort', temp_value: 'Temperature',
  temp_method: 'Temp method', temp_symptoms: 'Symptoms', temp_notes: 'Illness notes',
  menstrual_present: 'Menstrual symptoms', menstrual_symptoms: 'Symptoms', menstrual_notes: 'Menstrual notes',
  physical_notes: 'Physical health notes',
  prn_used_for_sleep_disturbance: 'PRN sleep', prn_name: 'PRN medication', prn_time: 'PRN time',
  prn_administered: 'PRN used', prn_given: 'PRN used', prn_used_for_symptoms_discomfort: 'PRN illness/discomfort',
  prn_used_for_pain: 'PRN pain', prn_used_for_headache: 'PRN headache', temp_prn_name: 'PRN medication',
  temp_prn_time: 'PRN time',
  aggression_flag: 'Aggression', aggression_type: 'Type', aggression_intensity: 'Intensity',
  aggression_notes: 'Aggression notes', manic_flag: 'Mania concern', mania_flag: 'Mania concern',
  manic_intensity: 'Mania intensity', mania_intensity: 'Mania intensity', mania_episode_status: 'Episode status',
  focus_trouble_flag: 'Trouble focusing', pressured_speech_present: 'Pressured speech',
  grandiosity_present: 'Grandiosity', behavior_anomaly_flag: 'Unusual behavior',
  behavior_anomaly_trigger: 'Trigger/context', behavior_anomaly_notes: 'Unusual behavior details',
  behavior_notes: 'Behavior notes', behavior_tracking: 'Behavior tracking',
  mood_energy: 'Energy', mood_speech: 'Speech', mood_attention: 'Attention',
  mood_engagement: 'Engagement', mood_engagement_score: 'Engagement',
  mood_pacing: 'Pacing', mood_irritability: 'Irritability', mood_regulation_notes: 'Mood notes',
  educational_tracking: 'Educational tracking', focus_goal_logs: 'Weekly focus logs',
  caregiver_notes: 'Caregiver notes', file_url: 'Attached file',
};

const CHOICE_LABELS = {
  mood_energy: { lower: 'Lower than usual', typical: 'Typical', higher: 'Higher than usual', much_higher: 'Much higher than usual' },
  mood_speech: { typical: 'Typical', more_talkative: 'More talkative than usual', rapid_pressured: 'Rapid / pressured', difficult_to_interrupt: 'Very difficult to interrupt' },
  mood_attention: { typical: 'Typical', some_difficulty: 'Some difficulty focusing', frequently_loses_focus: 'Frequently loses focus', unable_to_stay_with_activities: 'Unable to stay with activities' },
  mood_engagement: { '0': '0 - Engaged', '1': '1 - Less engaged', '2': '2 - Mostly withdrawn', '3': '3 - Highly withdrawn' },
  mood_engagement_score: { '0': '0 - Engaged', '1': '1 - Less engaged', '2': '2 - Mostly withdrawn', '3': '3 - Highly withdrawn' },
  mood_pacing: { none: 'None', occasional: 'Occasional', frequent: 'Frequent', nearly_constant: 'Nearly constant' },
  mood_irritability: { none: 'None', mild: 'Mild', moderate: 'Moderate', significant: 'Significant' },
};

const SECTIONS = [
  { title: 'Basic Care', keys: ['had_bm', 'hygiene', 'food_prep', 'cleanup', 'new_skill_score'] },
  { title: 'ADLs', keys: ['adl_entries', 'adl_category', 'adl_activity', 'adl_note', 'prompting_level', 'daily_living_notes'] },
  { title: 'Community / Vocational', prefixes: ['vocational_', 'home_', 'public_', 'community_', 'interaction_', 'pet_'], keys: [
    'vocational_participation', 'vocational_activity_type', 'vocational_time', 'vocational_prompting', 'vocational_notes',
    'home_activity_flag', 'home_activity_type', 'home_activity_time', 'home_activity_prompting', 'home_activity_note', 'home_notes',
    'pet_interaction_flag', 'pet_activity_type', 'pet_activity_note', 'pet_activity_notes',
    'public_activity_flag', 'public_activity_type', 'public_activity_time', 'public_activity_prompting', 'public_activity_note',
    'community_interaction_ok', 'interaction_type', 'interaction_prompting', 'interaction_note', 'community_time',
  ] },
  { title: 'Physical Health', prefixes: ['sleep_', 'night_', 'appetite_', 'med_change_', 'movement_', 'temp_', 'menstrual_'], keys: [
    'appears_good_health', 'appears_tired', 'hours_sleep', 'sleep_fell_asleep_time', 'sleep_onset_time',
    'sleep_onset_difficulty', 'night_wake_flag', 'night_waking', 'night_wake_count', 'appetite_change_flag',
    'appetite_change_direction', 'med_change_flag', 'med_change_name', 'med_change_dose', 'med_change_note',
    'movement_present', 'movement_main_type', 'movement_severity', 'movement_frequency', 'movement_times',
    'movement_body_map', 'movement_triggers', 'movement_interfered', 'movement_interfered_notes',
    'movement_safety_risk', 'movement_safety_notes', 'movement_notes', 'temp_present', 'temp_value',
    'temp_method', 'temp_symptoms', 'temp_symptom_other', 'temp_notes', 'menstrual_present',
    'menstrual_symptoms', 'menstrual_notes', 'physical_notes',
  ] },
  { title: 'PRN Medication', keys: [
    'prn_used_today', 'prn_administered', 'prn_given', 'prn_entries', 'prn_count', 'prn_used_for_sleep_disturbance',
    'prn_name', 'prn_time', 'prn_used_for_symptoms_discomfort', 'prn_used_for_pain', 'prn_used_for_headache',
    'temp_prn_name', 'temp_prn_time', 'prn_used_for_aggression', 'prn_used_for_anxiety', 'prn_used_for_mania',
    'prn_used_for_attention', 'prn_used_for_anomalous_behavior', 'prn_used_for_behavior_other',
    'behavior_support_prn_name', 'behavior_support_prn_time',
  ] },
  { title: 'Mood & Regulation', prefixes: ['behavior_', 'aggression_', 'manic_', 'mania_', 'focus_', 'fixation_', 'repetitive_', 'pressured_', 'grandiosity_', 'daydreaming_', 'easily_', 'difficulty_', 'short_attention_', 'needs_frequent_', 'hyperactive_', 'disengaged_'], keys: [
    'mood_energy', 'mood_speech', 'mood_attention', 'mood_engagement_score', 'mood_engagement',
    'mood_pacing', 'mood_irritability', 'mood_regulation_notes', 'aggression_flag', 'aggression_type',
    'aggression_intensity', 'aggression_notes', 'manic_flag', 'mania_flag', 'manic_intensity',
    'mania_intensity', 'mania_episode_status', 'focus_trouble_flag', 'daydreaming_zoning_out_present',
    'easily_distracted_environment_present', 'difficulty_staying_on_task_present', 'short_attention_span_present',
    'difficulty_following_instructions_present', 'needs_frequent_redirection_present', 'hyperactive_restless_present',
    'disengaged_low_motivation_present', 'fixation_present', 'fixation_category', 'repetitive_behavior_present',
    'pressured_speech_present', 'grandiosity_present', 'behavior_anomaly_flag', 'behavior_anomaly_trigger',
    'behavior_anomaly_notes', 'behavior_tracking', 'behavior_notes',
  ] },
  { title: 'Notes / Additional Answers', keys: [...NOTE_KEYS, 'educational_tracking', 'focus_goal_logs'] },
];

const SYSTEM_KEYS = new Set([
  'payload', 'dateObj', 'entryById', 'id', 'uuid', 'group_id', 'user_id', 'individual_id',
  'created_at', 'updated_at', 'submitted_at', 'date', 'entry_date', '_saved_at', '_submitted_at',
  'caregiver_name', 'caregiverName', 'caregiver', 'user_email', 'calendar_only', 'details',
  'file_url', 'media_upload', 'media_uploads', 'section_statuses',
]);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') {
    const text = value.trim();
    return !text || text === '—' || /^null|undefined$/i.test(text);
  }
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function humanize(key = '') {
  return LABELS[key] || String(key).replace(/^_+/, '').replace(/__/g, ': ').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseJsonishArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
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

function formatClockTime(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  if (hour > 23) return null;
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

function formatPrimitive(value, key = '') {
  if (isEmpty(value)) return '—';
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  const text = String(value).trim();
  const choice = CHOICE_LABELS[key]?.[text];
  if (choice) return choice;
  if (/(?:^|_)(?:time|at)$/.test(key) || key.includes('sleep_')) return formatClockTime(text) || text;
  if (/^(true|yes)$/i.test(text)) return 'Yes';
  if (/^(false|no)$/i.test(text)) return 'No';
  return text;
}

function formatValue(value, key = '') {
  if (isEmpty(value)) return '—';
  if (typeof value === 'string' && /^\s*[\[{]/.test(value)) {
    try { return formatValue(JSON.parse(value), key); } catch { /* use plain text */ }
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (item && typeof item === 'object') {
        const details = Object.entries(item)
          .filter(([, child]) => !isEmpty(child))
          .map(([childKey, child]) => `${humanize(childKey)}: ${formatValue(child, childKey)}`)
          .join('; ');
        return value.length > 1 ? `${index + 1}. ${details}` : details;
      }
      return formatPrimitive(item, key);
    }).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, child]) => !isEmpty(child))
      .map(([childKey, child]) => `${humanize(childKey)}: ${formatValue(child, childKey)}`)
      .join('\n');
  }
  return formatPrimitive(value, key);
}

function formatDate(value, includeTime = false) {
  if (!value) return '—';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  const parsed = new Date(dateOnly ? `${value}T12:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('en-US', includeTime || !dateOnly
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'long', day: 'numeric', year: 'numeric' });
}

function getValue(record, payload, key) {
  if (Object.prototype.hasOwnProperty.call(payload, key)) return payload[key];
  if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  return undefined;
}

function matchingKeys(allKeys, definition) {
  const available = new Set(allKeys);
  const ordered = (definition.keys || []).filter((key) => available.has(key));
  const exact = new Set(ordered);
  const remaining = allKeys.filter((key) => !exact.has(key) && (definition.prefixes || []).some((prefix) => key.startsWith(prefix)));
  return [...ordered, ...remaining];
}

function visibleKey(key) {
  if (SYSTEM_KEYS.has(key)) return false;
  return !/^(?:media|upload|attachment)(?:_|$)|submitted.*(?:local|time|zone)|timezone/i.test(key);
}

function caregiverNameFor(record, payload, fallback = '') {
  return fallback || payload.caregiver_name || payload.caregiverName || payload.caregiver || record.caregiver_name || record.caregiver || record.user_name || record.user_email || 'Unknown caregiver';
}

function dateValue(record, payload) {
  return record.date || payload.entry_date || payload.date || record.submitted_at || record.created_at || payload.submitted_at || null;
}

function rowText(row) {
  return String(row?.value ?? '').trim();
}

function isNegative(value) {
  return /^(no|false|not selected|none)$/i.test(String(value ?? '').trim());
}

function isNormalBaseline(row) {
  const key = String(row?.key || '');
  const value = rowText(row).toLowerCase();
  if (['mood_energy', 'mood_speech', 'mood_attention'].includes(key)) return value === 'typical';
  if (['mood_pacing', 'mood_irritability'].includes(key)) return value === 'none';
  return false;
}

function keepNegative(sectionTitle, row) {
  if (/adls/i.test(sectionTitle)) return false;
  return /prn|good health|tired|bm|appetite|medication change|illness|symptoms|menstrual|aggression|mania|focusing|vocational|home activity|community|interaction|pet/.test(`${row.key} ${row.label}`.toLowerCase());
}

function shouldShowRow(sectionTitle, row) {
  if (!row || isEmpty(row.value) || row.value === '—') return false;
  if (isNormalBaseline(row)) return false;
  if (isNegative(row.value) && !keepNegative(sectionTitle, row)) return false;
  return true;
}

function adlChips(row) {
  if (!/^adl_(?:entries|category|activity)$/.test(row.key)) return [];
  const chips = [];
  if (row.key === 'adl_entries') {
    parseJsonishArray(row.raw).forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      if (entry.category) chips.push(String(entry.category));
      parseJsonishArray(entry.activities).forEach((activity) => chips.push(String(activity)));
      if (entry.activity) chips.push(String(entry.activity));
    });
  } else {
    parseJsonishArray(row.raw).forEach((item) => chips.push(String(item)));
    if (!chips.length) String(row.value).split(/\n|,/).forEach((item) => chips.push(item));
  }
  return [...new Set(chips.map((chip) => chip.trim()).filter(Boolean))];
}

function fieldClass(sectionTitle, row) {
  if (adlChips(row).length) return 'field wide chip-field';
  const value = rowText(row);
  if (row.note || value.includes('\n') || value.length > 95) return 'field wide';
  if (/notes|details|activities|administrations|symptoms|body areas|tracking/i.test(row.label)) return 'field wide';
  if (value.length > 42 || String(row.label || '').length > 30) return 'field medium';
  return 'field';
}

function fieldHtml(row, sectionTitle) {
  const chips = adlChips(row);
  if (chips.length) {
    return `<div class="${fieldClass(sectionTitle, row)}"><div class="field-label">${escapeHtml(row.label)}</div><div class="chip-list">${chips.map((chip) => `<span class="chip">✓ ${escapeHtml(chip)}</span>`).join('')}</div></div>`;
  }
  return `<div class="${fieldClass(sectionTitle, row)}"><div class="field-label">${escapeHtml(row.label)}</div><div class="field-value">${escapeHtml(row.value)}</div></div>`;
}

export function buildCompactCaregiverCheckinPrint(record = {}, options = {}) {
  const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload) ? record.payload : {};
  const allKeys = [...new Set([...Object.keys(payload).filter(visibleKey), ...Object.keys(record).filter(visibleKey)])];
  const consumed = new Set();
  const meta = [
    { label: 'Date of shift', value: formatDate(dateValue(record, payload)) },
    { label: 'Caregiver', value: caregiverNameFor(record, payload, options.caregiverName) },
    { label: 'Submitted', value: formatDate(record.submitted_at || record.created_at || payload.submitted_at, true) },
    { label: 'Last updated', value: formatDate(record.updated_at || payload.updated_at, true) },
  ].filter((row) => !isEmpty(row.value) && row.value !== '—');

  const sections = SECTIONS.map((definition) => {
    const rows = matchingKeys(allKeys, definition).filter((key) => !consumed.has(key)).map((key) => {
      consumed.add(key);
      const raw = getValue(record, payload, key);
      const value = formatValue(raw, key);
      return { key, label: humanize(key), raw, value, note: NOTE_KEYS.has(key) || /notes?$/.test(key) };
    }).filter((row) => shouldShowRow(definition.title, row));
    if (/prn medication/i.test(definition.title)) {
      const prnUsedKey = (key) => /^(?:prn_used_today|prn_administered|prn_given)$/.test(key);
      const hasNo = rows.some((row) => prnUsedKey(row.key) && /^no$/i.test(row.value));
      const hasUse = rows.some((row) => /^prn/i.test(row.key) && (!prnUsedKey(row.key) || !/^no$/i.test(row.value)) && !isNegative(row.value) && row.value !== '—');
      if (!hasUse && rows.some((row) => isNegative(row.value))) {
        return {
          title: definition.title,
          rows: hasNo ? rows.filter((row) => prnUsedKey(row.key)).slice(0, 1) : [{ key: 'prn_used_today', label: 'PRN used', raw: 'no', value: 'No' }],
        };
      }
      return { title: definition.title, rows };
    }
    return { title: definition.title, rows };
  }).filter((section) => section.rows.length);

  const additional = allKeys.filter((key) => !consumed.has(key) && visibleKey(key)).sort((a, b) => humanize(a).localeCompare(humanize(b))).map((key) => {
    const raw = getValue(record, payload, key);
    return { key, label: humanize(key), raw, value: formatValue(raw, key), note: NOTE_KEYS.has(key) || /notes?$/.test(key) };
  }).filter((row) => shouldShowRow('Notes / Additional Answers', row));
  if (additional.length) sections.push({ title: 'Notes / Additional Answers', rows: additional });
  return { meta, sections };
}

export function compactCaregiverCheckinPrintStyles() {
  return 'body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:7.7in;margin:0 auto;padding:.18in 0;font-size:9.4pt;line-height:1.28;color:#111827}h1{font-size:16pt;line-height:1.1;margin:0 0 3pt}.meta-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5pt;margin:0 0 7pt}.meta-item,.field{border:1px solid #e5e7eb;border-radius:5pt;padding:4pt 5pt;min-width:0;background:#fff}.meta-label,.field-label{font-size:6.8pt;line-height:1.1;color:#6b7280;text-transform:uppercase;font-weight:700}.meta-value,.field-value{font-weight:650;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal}.checkin-print-record{break-after:page;page-break-after:always}.checkin-print-record:last-child{break-after:auto;page-break-after:auto}.section{border:1px solid #d9dee8;border-radius:6pt;margin:0 0 6pt;overflow:hidden;break-inside:avoid}.section-title{background:#f8fafc;border-bottom:1px solid #e5e7eb;padding:4pt 6pt;font-size:7.2pt;font-weight:800;color:#4b5563;text-transform:uppercase}.body{padding:5pt 6pt}.field-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4pt}.field.medium{grid-column:span 1}.field.wide{grid-column:1/-1}.field.wide .field-value{font-weight:500}.chip-list{display:flex;flex-wrap:wrap;gap:3pt}.chip{display:inline-flex;align-items:center;border:1px solid #d7dce4;border-radius:999px;padding:2pt 5pt;background:#f8fafc;font-weight:650;max-width:100%;overflow-wrap:break-word}.print-empty{display:none}@media print{@page{size:Letter portrait;margin:.38in}body{margin:0 auto;padding:0}.section{page-break-inside:avoid;break-inside:avoid}.section:has(.field.wide){page-break-inside:auto;break-inside:auto}}';
}

export function renderCompactCaregiverCheckinPrintRecord(record, options = {}) {
  const model = buildCompactCaregiverCheckinPrint(record, options);
  const meta = model.meta.map((row) => `<div class="meta-item"><div class="meta-label">${escapeHtml(row.label)}</div><div class="meta-value">${escapeHtml(row.value)}</div></div>`).join('');
  const sections = model.sections.map((section) => `
    <div class="section">
      <div class="section-title">${escapeHtml(section.title)}</div>
      <div class="body"><div class="field-grid">${section.rows.map((row) => fieldHtml(row, section.title)).join('')}</div></div>
    </div>
  `).join('');
  return `<article class="checkin-print-record"><h1>Caregiver Check-In</h1><div class="meta-grid">${meta}</div>${sections}</article>`;
}

export function renderCompactCaregiverCheckinPrintDocument(records = [], options = {}) {
  const title = options.title || 'Caregiver Check-In';
  const body = (records || []).filter(Boolean).map((record) => renderCompactCaregiverCheckinPrintRecord(record, options)).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${compactCaregiverCheckinPrintStyles()}</style></head><body>${body}</body></html>`;
}

export function openCompactCaregiverCheckinPrintWindow(records = [], options = {}) {
  const selected = (records || []).filter(Boolean);
  if (!selected.length) {
    window.alert?.('No check-ins match these filters.');
    return false;
  }
  const win = window.open('', '_blank');
  if (!win) {
    window.alert?.('Pop-up blocking prevented the print window from opening. Please allow pop-ups for STAR and try again.');
    return false;
  }
  win.document.open();
  win.document.write(renderCompactCaregiverCheckinPrintDocument(selected, options));
  win.document.close();
  const doPrint = () => {
    win.focus();
    win.print();
  };
  if (win.document.fonts?.ready) win.document.fonts.ready.then(() => setTimeout(doPrint, 120));
  else setTimeout(doPrint, 180);
  return true;
}
