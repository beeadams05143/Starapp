const booleanAnswer = value => value === true || value === 'yes' || value === 'true' ? true
  : value === false || value === 'no' || value === 'false' ? false : null;
export const SLEEP_FIELDS = ['hours_sleep', 'sleep_fell_asleep_time', 'sleep_onset_difficulty',
  'sleep_onset_response', 'night_wake_flag', 'night_wake_count', 'sleep_notes'];

export function normalizeSleepPayload(data = {}) {
  const out = { ...data, sleep_reporting_version: 2, sleep_reporting: data.sleep_reporting || null };
  if (out.sleep_reporting !== 'yes') {
    for (const key of SLEEP_FIELDS) out[key] = null;
  }
  return out;
}

// The older checkbox stored unchecked as false, so false alone cannot prove
// that anyone observed a night without difficulty. Never rewrite the record.
export function sleepObservation(data = {}) {
  const scope = data.sleep_reporting;
  if (scope === 'not_observed' || (data.sleep_reporting_version === 2 && scope !== 'yes')) {
    return { onset: null, waking: null, concern: null, status: scope === 'not_observed' ? 'Not observed — day shift / no sleep information' : 'Not reported' };
  }
  const rawOnset = booleanAnswer(data.sleep_onset_difficulty);
  const onset = rawOnset === false && data.sleep_onset_response !== 'no' && data.sleep_reporting_version !== 2 ? null : rawOnset;
  const waking = booleanAnswer(data.night_wake_flag);
  const concern = onset === true || waking === true ? true : onset === false && waking === false ? false : null;
  const hasDetails = !!(String(data.hours_sleep ?? '').trim() || data.sleep_fell_asleep_time || data.sleep_notes);
  const status = scope === 'yes' || concern !== null || hasDetails ? 'Reported' : 'Not reported';
  return { onset, waking, concern, status };
}

export function sleepDisplayPayload(data = {}) {
  const state = sleepObservation(data);
  const out = { ...data, sleep_reporting_status: state.status };
  if (data.sleep_reporting_version === 2 && data.sleep_reporting !== 'yes') {
    for (const key of SLEEP_FIELDS) out[key] = null;
  } else {
    out.sleep_onset_difficulty = state.onset === null
      ? data.sleep_onset_response === 'not_sure' ? 'Not sure' : 'Not reported' : state.onset;
  }
  // Internal answeredness markers are not observations to print.
  delete out.sleep_reporting_version;
  delete out.sleep_onset_response;
  delete out.sleep_reporting;
  return out;
}
