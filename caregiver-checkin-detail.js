import { rest } from './restClient.js?v=2026.03.29A';

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
  updated_at: 'Last updated', caregiver_name: 'Caregiver', had_bm: 'Had a bowel movement?',
  hygiene: 'Hygiene / toileting completed?', food_prep: 'Food preparation completed?',
  cleanup: 'Cleaning / household completed?', new_skill_score: 'Prompting / independence score',
  adl_entries: 'ADL activities', adl_category: 'ADL category', adl_activity: 'ADL activity',
  adl_note: 'ADL note', prompting_level: 'Prompting / independence', daily_living_notes: 'Daily living notes',
  vocational_participation: 'Participated in vocational activity?', vocational_time: 'Time in vocational activity',
  vocational_prompting: 'Prompting (vocational)', vocational_activity_type: 'Vocational activity type',
  vocational_notes: 'Vocational notes', home_activity_flag: 'Engaged in a home activity?',
  home_activity_time: 'Time spent (home)', home_activity_prompting: 'Prompting (home)',
  home_activity_type: 'Home activity type', home_activity_note: 'Home activity note', home_notes: 'Home / family notes',
  pet_interaction_flag: 'Pet interaction?', pet_activity_type: 'Pet activity type', pet_activity_note: 'Pet activity note',
  pet_activity_notes: 'Pet interaction notes', public_activity_flag: 'Engaged in community-at-large activity?',
  public_activity_time: 'Time spent (community-at-large)', public_activity_prompting: 'Prompting (community-at-large)',
  public_activity_type: 'Community activity type', public_activity_note: 'Community activity note',
  community_interaction_ok: 'Appropriate community interaction?', interaction_type: 'Interaction type',
  interaction_prompting: 'Prompting (interaction)', interaction_note: 'Interaction note', community_time: 'Total community minutes',
  appears_good_health: 'Appears in good health?', appears_tired: 'Appears tired?', hours_sleep: 'Hours of sleep',
  sleep_fell_asleep_time: 'Fell asleep at', sleep_onset_time: 'Sleep onset time',
  sleep_onset_difficulty: 'Difficulty falling asleep?', night_wake_flag: 'Woke during the night?',
  night_waking: 'Night waking?', night_wake_count: 'Number of night wakings',
  prn_used_for_sleep_disturbance: 'PRN used for sleep disturbance', prn_name: 'PRN medication', prn_time: 'PRN time',
  appetite_change_flag: 'Appetite changed?', appetite_change_direction: 'Appetite change direction',
  med_change_flag: 'Medication change?', movement_present: 'Unusual movement present?',
  temp_present: 'Temperature / illness concern?', menstrual_present: 'Menstrual cycle present?', physical_notes: 'Physical health notes',
  aggression_flag: 'Aggression occurred?', aggression_type: 'Aggression type', aggression_intensity: 'Aggression intensity',
  aggression_notes: 'Aggression notes', manic_flag: 'Seemed manic?', mania_flag: 'Seemed manic?',
  manic_intensity: 'Mania intensity', mania_intensity: 'Mania intensity', mania_episode_status: 'Episode status',
  focus_trouble_flag: 'Trouble focusing?', fixation_present: 'Fixation / perseveration',
  repetitive_behavior_present: 'Repetitive behavior', pressured_speech_present: 'Pressured / rapid speech',
  grandiosity_present: 'Grandiosity', behavior_anomaly_flag: 'Anything unusual in mood or behavior?',
  behavior_anomaly_trigger: 'Unusual behavior trigger / context', behavior_anomaly_notes: 'Unusual behavior details',
  behavior_notes: 'Behavior / mental health notes', caregiver_notes: 'Caregiver notes', notes: 'Notes',
  educational_tracking: 'Educational tracking', focus_goal_logs: 'Weekly focus logs', file_url: 'Attached file',
};

const SECTIONS = [
  {
    title: 'Basic care items',
    keys: ['had_bm', 'hygiene', 'food_prep', 'cleanup', 'new_skill_score'],
  },
  {
    title: 'ADLs',
    keys: ['adl_entries', 'adl_category', 'adl_activity', 'adl_note', 'prompting_level', 'daily_living_notes'],
  },
  {
    title: 'Community & vocational',
    prefixes: ['vocational_', 'home_', 'public_', 'community_', 'interaction_', 'pet_'],
    keys: ['vocational_time', 'community_time', 'pet_interaction_flag', 'pet_activity_type', 'pet_activity_note', 'pet_activity_notes'],
  },
  {
    title: 'Physical & health',
    prefixes: ['sleep_', 'night_', 'appetite_', 'med_change_', 'movement_', 'temp_', 'menstrual_'],
    keys: ['appears_good_health', 'appears_tired', 'hours_sleep', 'had_bm', 'prn_name', 'prn_time',
      'prn_administered', 'prn_given', 'prn_used_for_sleep_disturbance', 'prn_used_for_symptoms_discomfort',
      'prn_used_for_pain', 'prn_used_for_headache', 'physical_notes'],
  },
  {
    title: 'Behavior & mental health',
    prefixes: ['behavior_', 'aggression_', 'manic_', 'mania_', 'focus_', 'fixation_', 'repetitive_',
      'pressured_', 'grandiosity_', 'daydreaming_', 'easily_', 'difficulty_', 'short_attention_',
      'needs_frequent_', 'hyperactive_', 'disengaged_', 'prn_used_for_aggression', 'prn_used_for_anxiety',
      'prn_used_for_mania', 'prn_used_for_attention', 'prn_used_for_anomalous_behavior', 'prn_used_for_behavior_other'],
    keys: [],
  },
  {
    title: 'Caregiver notes',
    keys: [...NOTE_KEYS],
  },
];

const SYSTEM_KEYS = new Set(['payload', 'dateObj', 'entryById']);
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const errorMessage = document.getElementById('errorMessage');
const detailContent = document.getElementById('detailContent');
const sectionsElement = document.getElementById('sections');
const pageTitle = document.getElementById('pageTitle');
const pageSubtitle = document.getElementById('pageSubtitle');
const editButton = document.getElementById('editButton');

function goBack() {
  const referrer = document.referrer ? new URL(document.referrer, window.location.href) : null;
  if (referrer?.origin === window.location.origin && window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = 'caregiver-report.html#caregiver-checkins';
}

document.getElementById('backButton')?.addEventListener('click', goBack);
document.getElementById('errorBackButton')?.addEventListener('click', () => {
  window.location.href = 'caregiver-report.html#caregiver-checkins';
});

function owns(object, key) {
  return !!object && Object.prototype.hasOwnProperty.call(object, key);
}

function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function humanize(key = '') {
  if (LABELS[key]) return LABELS[key];
  return String(key)
    .replace(/^_+/, '')
    .replace(/__/g, ': ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPrimitive(value) {
  if (isEmpty(value)) return 'Not answered';
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  const text = String(value);
  if (/^(true|yes)$/i.test(text.trim())) return 'Yes';
  if (/^(false|no)$/i.test(text.trim())) return 'No';
  return text;
}

function formatValue(value, depth = 0) {
  if (isEmpty(value)) return 'Not answered';
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (item && typeof item === 'object') {
        const details = Object.entries(item)
          .map(([key, child]) => `${humanize(key)}: ${formatValue(child, depth + 1)}`)
          .join('; ');
        return value.length > 1 ? `${index + 1}. ${details}` : details;
      }
      return formatPrimitive(item);
    }).join('\n');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, child]) => `${humanize(key)}: ${formatValue(child, depth + 1)}`)
      .join('\n');
  }
  return formatPrimitive(value);
}

function getValue(record, payload, key) {
  if (owns(payload, key)) return { exists: true, value: payload[key], source: 'payload' };
  if (owns(record, key)) return { exists: true, value: record[key], source: 'record' };
  return { exists: false, value: undefined, source: null };
}

function addSection(title, rows) {
  if (!rows.length) return;
  const section = document.createElement('section');
  section.className = 'detail-section';
  const heading = document.createElement('h2');
  heading.className = 'section-title';
  heading.textContent = title;
  const body = document.createElement('div');
  body.className = 'section-body';

  rows.forEach(({ key, label, value, note = false }) => {
    const row = document.createElement('div');
    row.className = `answer-row${note ? ' is-note' : ''}`;
    if (key) row.dataset.field = key;
    const labelElement = document.createElement('div');
    labelElement.className = 'answer-label';
    labelElement.textContent = label;
    const valueElement = document.createElement('div');
    valueElement.className = `answer-value${isEmpty(value) ? ' not-answered' : ''}`;
    valueElement.textContent = formatValue(value);
    row.append(labelElement, valueElement);
    body.appendChild(row);
  });

  section.append(heading, body);
  sectionsElement.appendChild(section);
}

function dateValue(record, payload) {
  return record.date || payload.entry_date || record.submitted_at || record.created_at || null;
}

function formatDate(value, includeTime = false) {
  if (!value) return 'Not answered';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  const parsed = new Date(dateOnly ? `${value}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('en-US', includeTime || !dateOnly
    ? { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

async function caregiverLabel(record, payload) {
  const savedName = payload.caregiver_name ?? payload.caregiverName ?? payload.caregiver ?? record.caregiver_name;
  const isPlaceholder = typeof savedName === 'string' && /^caregiver\b/i.test(savedName.trim());
  if (savedName && !isPlaceholder) return String(savedName);
  if (record.user_id) {
    try {
      const profiles = await rest(`profiles?select=full_name,display_name,public_name,name&id=eq.${encodeURIComponent(record.user_id)}&limit=1`);
      const profile = Array.isArray(profiles) ? profiles[0] : profiles;
      const name = profile?.full_name || profile?.display_name || profile?.public_name || profile?.name;
      if (name) return name;
    } catch (error) {
      console.warn('[caregiver detail] profile name unavailable', error?.message || error);
    }
  }
  return record.user_email || 'Unknown caregiver';
}

function matchingKeys(allKeys, definition) {
  const exact = new Set(definition.keys || []);
  return allKeys.filter((key) => exact.has(key) || (definition.prefixes || []).some((prefix) => key.startsWith(prefix)));
}

function showError(message) {
  loadingState.classList.add('is-hidden');
  detailContent.classList.add('is-hidden');
  errorMessage.textContent = message;
  errorState.classList.remove('is-hidden');
}

async function loadDetail() {
  const checkinId = new URLSearchParams(window.location.search).get('id');
  if (!checkinId) {
    showError('No check-in was selected. Return to Caregiver Check-Ins and choose View again.');
    return;
  }

  try {
    const rows = await rest(`caregiver_checkins?select=*&id=eq.${encodeURIComponent(checkinId)}&limit=1`);
    const record = Array.isArray(rows) ? rows[0] : rows;
    if (!record) {
      showError('This check-in could not be found. It may have been removed, or you may no longer have access to it.');
      return;
    }

    const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
      ? record.payload
      : {};
    const caregiver = await caregiverLabel(record, payload);
    const date = dateValue(record, payload);
    pageTitle.textContent = formatDate(date);
    pageSubtitle.textContent = caregiver;
    document.title = `${formatDate(date)} | Caregiver Check-In | STAR`;
    editButton.href = `caregiver-report.html?edit=${encodeURIComponent(checkinId)}#caregiver-checkins`;

    const consumed = new Set();
    const dateRows = [];
    const dateFields = [
      ['date', 'Date of shift', record.date ?? payload.entry_date],
      ['submitted_at', 'Submitted', record.submitted_at ?? payload._submitted_at],
      ['created_at', 'Created', record.created_at],
      ['updated_at', 'Last updated', record.updated_at],
    ];
    dateFields.forEach(([key, label, value]) => {
      if (owns(record, key) || (key === 'date' && owns(payload, 'entry_date')) || (key === 'submitted_at' && owns(payload, '_submitted_at'))) {
        consumed.add(key);
        if (key === 'date') consumed.add('entry_date');
        if (key === 'submitted_at') consumed.add('_submitted_at');
        dateRows.push({ key, label, value: isEmpty(value) ? value : formatDate(value, key !== 'date') });
      }
    });
    addSection('Date / time', dateRows);

    const caregiverRows = [{ key: 'caregiver_name', label: 'Caregiver', value: caregiver }];
    ['caregiver_name', 'caregiverName', 'caregiver', 'user_email'].forEach((key) => consumed.add(key));
    addSection('Caregiver', caregiverRows);

    const payloadKeys = Object.keys(payload).filter((key) => !SYSTEM_KEYS.has(key));
    const recordKeys = Object.keys(record).filter((key) => !SYSTEM_KEYS.has(key));
    const allKeys = [...new Set([...payloadKeys, ...recordKeys])];

    SECTIONS.forEach((definition) => {
      const keys = matchingKeys(allKeys, definition).filter((key) =>
        !consumed.has(key) && (definition.title === 'Caregiver notes' || !NOTE_KEYS.has(key))
      );
      const rowsForSection = keys.map((key) => {
        const result = getValue(record, payload, key);
        consumed.add(key);
        return { key, label: humanize(key), value: result.value, note: NOTE_KEYS.has(key) || /notes?$/.test(key) };
      });
      addSection(definition.title, rowsForSection);
    });

    const additionalRows = allKeys
      .filter((key) => !consumed.has(key) && !SYSTEM_KEYS.has(key))
      .sort((a, b) => humanize(a).localeCompare(humanize(b)))
      .map((key) => {
        const result = getValue(record, payload, key);
        consumed.add(key);
        return { key, label: humanize(key), value: result.value, note: NOTE_KEYS.has(key) || /notes?$/.test(key) };
      });
    addSection('Other saved fields', additionalRows);

    loadingState.classList.add('is-hidden');
    errorState.classList.add('is-hidden');
    detailContent.classList.remove('is-hidden');
  } catch (error) {
    console.error('[caregiver detail] load failed', error);
    const signedOut = /session|required|sign in/i.test(error?.message || '');
    showError(signedOut
      ? 'Please sign in again, then return to Caregiver Check-Ins and choose View.'
      : 'This check-in could not be loaded. Please go back and try again.');
  }
}

loadDetail();
