// Group-scoped ISA reporting from saved caregiver check-ins.
// Values are evidence, never automatic goal-completion judgments.
export function buildIsaProgress(entries, cards, scope = {}) {
  const groupId = String(scope.groupId || '');
  if (!groupId) throw new Error('Choose a STAR group before viewing ISA progress.');
  const individualId = scope.individualId == null ? null : String(scope.individualId);
  const start = String(scope.start || '');
  const end = String(scope.end || '');
  if (start && end && start > end) throw new Error('The start date must come before the end date.');

  const groups = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    if (String(card.group_id || '') !== groupId) continue;
    if (individualId !== null && String(card.individual_id || '') !== individualId) continue;
    if (!card.id || card.status === 'draft') continue;
    groups.set(String(card.id), {
      id: String(card.id), title: String(card.title || 'Untitled ISA outcome'),
      category: String(card.category || ''), status: card.status || 'active',
      measurements: new Map(), observations: [], dates: new Set()
    });
  }

  const seenRecords = new Set();
  for (const row of Array.isArray(entries) ? entries : []) {
    if (!row || typeof row !== 'object') continue;
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    if (String(row.group_id ?? payload.group_id ?? '') !== groupId) continue;
    if (individualId !== null && String(row.individual_id ?? payload.individual_id ?? '') !== individualId) continue;
    // The explicitly recorded check-in date, not a UTC submission timestamp.
    const date = String(row.date || payload.entry_date || payload.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if ((start && date < start) || (end && date > end)) continue;
    const recordId = row.id ? String(row.id) : null;
    if (recordId && seenRecords.has(recordId)) continue;
    if (recordId) seenRecords.add(recordId);
    let stored = payload.isa_entries ?? row.isa_entries;
    if (typeof stored === 'string') {
      try { stored = JSON.parse(stored); } catch { stored = []; }
    }
    if (!Array.isArray(stored)) continue;
    const seenAnswers = new Set();
    for (const answer of stored) {
      if (!answer || !answer.outcome_id || !answer.measurement_id) continue;
      if (answer.value === null || answer.value === undefined || String(answer.value).trim() === '') continue;
      const identity = String(answer.outcome_id) + ':' + String(answer.measurement_id);
      if (seenAnswers.has(identity)) continue;
      seenAnswers.add(identity);
      const outcomeId = String(answer.outcome_id);
      let group = groups.get(outcomeId);
      if (!group) {
        group = {
          id: outcomeId, title: String(answer.outcome_title || 'Historical ISA outcome'),
          category: String(answer.outcome_category || ''),
          status: 'historical', measurements: new Map(), observations: [], dates: new Set()
        };
        groups.set(outcomeId, group);
      }
      const measurementId = String(answer.measurement_id);
      const label = String(answer.measurement_label || 'Recorded measurement');
      const unit = String(answer.unit || '');
      const kind = String(answer.answer_type || '');
      let metric = group.measurements.get(measurementId);
      if (!metric) {
        metric = {id: measurementId, label, unit, kind, answers: []};
        group.measurements.set(measurementId, metric);
      }
      const observation = {
        date, caregiver: String(row.caregiver_name || payload.caregiver_name || 'Caregiver'),
        label, value: String(answer.value), unit, kind,
        activity: String(answer.activity || ''), version: answer.outcome_version ?? null,
        recordId
      };
      group.observations.push(observation);
      group.dates.add(date);
      metric.answers.push(observation);
    }
  }
  const outcomes = [...groups.values()].map(group => ({
    id: group.id, title: group.title, category: group.category, status: group.status,
    dates: [...group.dates].sort(), observations: group.observations.sort((a,b) =>
      a.date.localeCompare(b.date) || a.label.localeCompare(b.label)),
    measurements: [...group.measurements.values()]
  })).sort((a,b) => a.title.localeCompare(b.title));
  return {
    groupId, start, end, outcomes,
    answerCount: outcomes.reduce((n,o) => n + o.observations.length, 0),
    observationDays: new Set(outcomes.flatMap(o => o.dates)).size
  };
}

// Summarize the same underlying evidence that remains accessible in the expandable
// "View dated caregiver entries" area. Never equate a response with goal attainment.
function formatNumber(value) {
  return String(Math.round((value + Number.EPSILON) * 10) / 10);
}
function recordedTimes(count) {
  return count === 1 ? 'once' : count === 2 ? 'twice' : count + ' times';
}
export function summarizeIsaMeasurement(metric) {
  const answers = Array.isArray(metric?.answers) ? metric.answers : [];
  const label = String(metric?.label || 'Recorded measurement').trim().replace(/[.\s]+$/, '');
  if (!answers.length) return label + ': No recorded responses for this period.';
  const days = new Set(answers.map(a => a.date).filter(Boolean)).size;
  const unitValues = new Set(answers.map(a => String(a.unit || '').trim()));
  const numbers = answers.map(a => {
    const text = String(a.value ?? '').trim();
    return text !== '' && /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(text) ? Number(text) : NaN;
  });
  const numeric = unitValues.size === 1 && numbers.every(Number.isFinite);
  const datePhrase = days === 1 ? 'one recorded date' : days + ' recorded dates';
  if (numeric) {
    const min = Math.min(...numbers), max = Math.max(...numbers);
    const average = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    const unit = String(answers[0].unit || metric.unit || '').trim();
    const suffix = unit ? ' ' + unit : '';
    const onePerDate = days === answers.length;
    const frequency = onePerDate
      ? (days + ' reported ' + (days === 1 ? 'date' : 'dates'))
      : (answers.length + ' recorded responses across ' + days + ' ' + (days === 1 ? 'date' : 'dates'));
    const scope = onePerDate ? 'per reported date' : 'per recorded response';
    if (answers.length === 1) {
      return label + ': ' + formatNumber(numbers[0]) + suffix + ' recorded on one date.';
    }
    if (/^steps?$/i.test(unit)) {
      // The number does not identify the constituent actions. Do not turn a
      // count of completed steps into an invented skills narrative.
      return label + ': Across ' + frequency + ', caregivers recorded ' +
        formatNumber(min) + ' to ' + formatNumber(max) + ' steps completed ' +
        scope + '. The responses do not specify which steps were completed.';
    }
    if (/^(?:minutes?|hours?|seconds?)$/i.test(unit)) {
      return label + ': Across ' + frequency + ', documented time ranged from ' +
        formatNumber(min) + ' to ' + formatNumber(max) + suffix + ' ' + scope +
        ', averaging ' + formatNumber(average) + suffix + ' ' + scope + '.';
    }
    return label + ': Across ' + frequency + ', the recorded values ranged from ' +
      formatNumber(min) + ' to ' + formatNumber(max) + suffix + ' ' + scope +
      ' (average ' + formatNumber(average) + suffix + ' ' + scope + ').';
  }
  const frequencies = new Map();
  for (const answer of answers) {
    // Never interpret "Declined", "Not observed", "Not offered", or zero as failure.
    const response = String(answer.value ?? '').trim().replace(/\s+/g, ' ');
    if (!response) continue;
    frequencies.set(response, (frequencies.get(response) || 0) + 1);
  }
  const ordered = [...frequencies.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
  const shown = ordered.slice(0, 5).map(([value,count]) => {
    // Long free-text responses belong in the dated evidence, not the short letter.
    const shortValue = value.length > 90 ? value.slice(0,87) + '…' : value;
    return '“' + shortValue + '” ' + recordedTimes(count);
  });
  if (ordered.length > 5) shown.push((ordered.length - 5) + ' other distinct responses');
  return label + ': ' + answers.length + ' recorded answers across ' + datePhrase +
    ' — ' + shown.join('; ') + '.';
}
export function summarizeIsaOutcome(outcome) {
  if (!outcome?.observations?.length) return 'No ISA measurements were recorded for this outcome in the selected period.';
  const facts = outcome.measurements.map(summarizeIsaMeasurement);
  return facts.join(' ');
}
export function formatIsaProgressText(report) {
  const lines = ['ISA Outcome Summary'];
  if (report.start || report.end) {
    lines.push('Reporting period: ' + (report.start || 'Beginning') + ' to ' + (report.end || 'Present'));
  }
  lines.push('Caregiver check-ins contained ' + report.answerCount + ' documented ISA measurement ' +
    (report.answerCount === 1 ? 'answer' : 'answers') + ' across ' + report.observationDays +
    ' date' + (report.observationDays === 1 ? '' : 's') + '.');
  for (const outcome of report.outcomes) {
    lines.push('', outcome.title + (outcome.category ? ' — ' + outcome.category : ''),
      summarizeIsaOutcome(outcome));
  }
  if (!report.outcomes.length) lines.push('', 'No ISA outcome cards or saved answers were found for this selection.');
  lines.push('', 'These are caregiver-reported measurements, not a determination of ISA goal achievement. ' +
    'Skipped, missing, declined, or not-observed answers are not automatically treated as lack of progress. ' +
    'Individual dated entries remain available in Reports for review.');
  return lines.join('\n');
}

export function createIsaProgressReport({rest, document: doc = document, clock = () => new Date()}) {
  let currentGroupId = null, entries = [], cardPromise = null, status = 'not-loaded', lastText = '', revision = 0;
  const $ = id => doc.getElementById(id);
  const firstOfMonth = date => date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-01';
  const dateKey = date => date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
  const today = clock();
  const startField = $('isaProgressStart'), endField = $('isaProgressEnd'), preset = $('isaProgressPeriod');
  if (startField) startField.value = firstOfMonth(today);
  if (endField) endField.value = dateKey(today);
  const dateContainer = $('isaCustomDates'), dateSummary = $('isaPeriodSummary');
  function syncPeriodPresentation() {
    const isCustom = preset?.value === 'custom';
    if (dateContainer) dateContainer.hidden = !isCustom;
    if (!dateSummary) return;
    const start = startField?.value || '', end = endField?.value || '';
    const readable = key => key ? new Date(key + 'T12:00:00').toLocaleDateString(undefined,
      {month:'short',day:'numeric',year:'numeric'}) : '';
    dateSummary.textContent = !start && !end ? 'Showing all recorded dates' :
      'Showing ' + (readable(start) || 'the beginning') + ' – ' + (readable(end) || 'today');
  }
  syncPeriodPresentation();
  function scope(extra = {}) {
    return {groupId: currentGroupId, start: startField?.value || '', end: endField?.value || '', ...extra};
  }
  async function getCards() {
    if (!cardPromise) throw new Error('ISA cards are not loaded for this group.');
    return cardPromise;
  }
  async function report(extra = {}) {
    const cards = await getCards();
    if (status !== 'ready' || !currentGroupId) throw new Error('ISA data could not be loaded.');
    return buildIsaProgress(entries, cards, scope(extra));
  }
  function render(reportData) {
    const target = $('isaProgressList');
    if (!target) return;
    target.replaceChildren();
    lastText = formatIsaProgressText(reportData);
    $('isaProgressStatus').textContent = reportData.answerCount + ' saved ISA answers across ' +
      reportData.observationDays + ' date(s). Missing answers are not counted as lack of progress.';
    for (const outcome of reportData.outcomes) {
      const outer = doc.createElement('details');
      outer.style.cssText = 'border:1px solid #e3dccd;border-radius:12px;padding:12px 14px;background:#fffdf8;margin:10px 0';
      const heading = doc.createElement('summary');
      heading.style.cssText = 'font-weight:700;cursor:pointer;line-height:1.45';
      heading.textContent = outcome.title + ' — ' + outcome.observations.length + ' saved answer(s)';
      outer.append(heading);
      if (outcome.category) {
        const category = doc.createElement('p');
        category.style.cssText = 'color:#62686c;font-size:13px';
        category.textContent = outcome.category + (outcome.status === 'archived' ? ' · Archived goal (historical evidence retained)' : '');
        outer.append(category);
      }
      if (!outcome.observations.length) {
        const empty = doc.createElement('p');
        empty.textContent = 'No answers were recorded in this date range.';
        outer.append(empty);
      } else {
        for (const measure of outcome.measurements) {
          const label = doc.createElement('p');
          label.style.cssText = 'font-size:14px;margin:8px 0';
          label.textContent = summarizeIsaMeasurement(measure);
          outer.append(label);
        }
        const history = doc.createElement('details');
        const historySummary = doc.createElement('summary');
        historySummary.textContent = 'View dated caregiver entries';
        history.append(historySummary);
        const list = doc.createElement('ul');
        list.style.cssText = 'padding-left:20px;font-size:14px;line-height:1.6';
        for (const obs of outcome.observations) {
          const li = doc.createElement('li');
          li.textContent = obs.date + ' · ' + obs.caregiver + ' · ' + obs.label + ': ' +
            obs.value + (obs.unit ? ' ' + obs.unit : '') + (obs.activity ? ' · ' + obs.activity : '');
          list.append(li);
        }
        history.append(list);
        outer.append(history);
      }
      target.append(outer);
    }
    if (!reportData.outcomes.length) target.textContent = 'No ISA outcome cards are available in this group.';
    for (const id of ['isaProgressCopy','isaProgressPrint']) { if ($(id)) $(id).disabled = false; }
  }
  async function redraw() {
    const initialRevision = revision;
    try {
      if (!currentGroupId) return;
      const data = await report();
      if (initialRevision !== revision) return;
      render(data);
    } catch (err) {
      if (initialRevision !== revision) return;
      if ($('isaProgressStatus')) $('isaProgressStatus').textContent = 'ISA progress unavailable: ' + (err?.message || 'Unable to load data');
      if ($('isaProgressList')) $('isaProgressList').replaceChildren();
      for (const id of ['isaProgressCopy','isaProgressPrint']) { if ($(id)) $(id).disabled = true; }
    }
  }
  async function refresh(groupId, rows) {
    const id = String(groupId || '');
    ++revision;
    if (!id) {
      currentGroupId = null; status = 'error';
      if ($('isaProgressStatus')) $('isaProgressStatus').textContent = 'Select an active group to view ISA progress.';
      if ($('isaProgressList')) $('isaProgressList').replaceChildren();
      return;
    }
    currentGroupId = id;
    entries = Array.isArray(rows) ? rows : [];
    status = 'loading';
    if ($('isaProgressStatus')) $('isaProgressStatus').textContent = 'Loading ISA outcome cards…';
    const key = id;
    cardPromise = rest('star_isa_outcomes?select=id,group_id,individual_id,title,category,status,measurements&group_id=eq.' +
      encodeURIComponent(id) + '&order=created_at.asc&limit=500').then(cards => {
        if (!Array.isArray(cards) || cards.length >= 500) throw new Error('ISA cards could not be fully loaded.');
        return cards;
      });
    try { await cardPromise; if (currentGroupId === key) {status = 'ready'; await redraw();} }
    catch (err) { if (currentGroupId === key) {status = 'error'; await redraw();} }
  }
  async function letter(extra) {
    if (!extra?.groupId || String(extra.groupId) !== currentGroupId) throw new Error('ISA group changed. Reload Reports.');
    return formatIsaProgressText(await report(extra));
  }
  preset?.addEventListener('change', () => {
    const value = preset.value, d = clock();
    if (value === 'month') { startField.value = firstOfMonth(d); endField.value = dateKey(d); }
    else if (value === 'quarter') { const beginning = new Date(d.getFullYear(),d.getMonth()-2,1); startField.value = firstOfMonth(beginning); endField.value = dateKey(d); }
    else if (value === 'all') { startField.value = ''; endField.value = ''; }
    syncPeriodPresentation();
    redraw();
  });
  for (const field of [startField,endField]) field?.addEventListener('change', () => {
    if (preset) preset.value = 'custom';
    syncPeriodPresentation();
    redraw();
  });
  $('isaProgressCopy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(lastText); $('isaProgressStatus').textContent = 'ISA progress summary copied.'; }
    catch { $('isaProgressStatus').textContent = 'Clipboard unavailable. Try selecting the dated entries.'; }
  });
  $('isaProgressPrint')?.addEventListener('click', () => {
    if (!lastText) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { $('isaProgressStatus').textContent = 'Please allow a new window to print ISA progress.'; return; }
    const sheet = printWindow.document.createElement('pre');
    sheet.style.cssText = 'white-space:pre-wrap;font:14px/1.6 Arial,sans-serif;margin:32px';
    sheet.textContent = lastText;
    printWindow.document.body.append(sheet);
    printWindow.document.title = 'STAR ISA Outcome Progress';
    printWindow.print();
  });
  return {refresh,letter,redraw};
}
