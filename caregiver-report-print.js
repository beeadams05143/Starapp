const text = (value, fallback = '—') => {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
};

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = text(content, '');
  return node;
}

function appendText(parent, tag, className, content) {
  const node = element(tag, className, content);
  parent.appendChild(node);
  return node;
}

function addMetaGrid(parent, items = []) {
  const grid = element('div', 'print-report-meta');
  items.forEach(({ label, value }) => {
    const item = element('div', 'print-meta-item');
    appendText(item, 'span', 'print-meta-label', label);
    appendText(item, 'span', 'print-meta-value', value);
    grid.appendChild(item);
  });
  parent.appendChild(grid);
}

function addMetricGrid(parent, metrics = []) {
  const grid = element('div', 'print-metric-grid');
  metrics.forEach(({ label, value }) => {
    const card = element('div', 'print-metric-card');
    appendText(card, 'span', 'print-metric-label', label);
    appendText(card, 'span', 'print-metric-value', value);
    grid.appendChild(card);
  });
  parent.appendChild(grid);
}

function addTable(parent, columns = [], rows = [], className = '') {
  if (!rows.length) return null;
  const table = element('table', `print-data-table ${className}`.trim());
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  columns.forEach((column) => appendText(headerRow, 'th', '', column.label));
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.note) tr.className = 'print-note-row';
    columns.forEach((column) => appendText(tr, 'td', '', row[column.key]));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  parent.appendChild(table);
  return table;
}

function addSection(root, title, { major = true, first = false } = {}) {
  const classes = ['print-report-section'];
  if (major) classes.push('print-major-section');
  if (first) classes.push('print-first-section');
  const section = element('section', classes.join(' '));
  appendText(section, 'h2', '', title);
  root.appendChild(section);
  return section;
}

function renderOverview(root, model) {
  const section = addSection(root, 'Report Overview', { major: false, first: true });
  addMetricGrid(section, model.overviewMetrics || []);
  if (model.summaryLines?.length) {
    appendText(section, 'h3', '', 'Plain-language summary');
    const list = element('ul', 'print-summary-list');
    model.summaryLines.forEach((line) => appendText(list, 'li', '', line));
    section.appendChild(list);
  }
}

function renderServices(root, model) {
  const section = addSection(root, 'Services Summary');
  if (model.weeklyAverages?.length) {
    appendText(section, 'h3', '', 'Weekly averages');
    addMetricGrid(section, model.weeklyAverages);
  }
  const grid = element('div', 'print-service-grid');
  (model.services || []).forEach((service) => {
    const card = element('div', 'print-service-card');
    appendText(card, 'h3', '', service.title);
    (service.metrics || []).forEach(({ label, value }) => {
      const line = appendText(card, 'p', '', `${label}: ${text(value)}`);
      line.style.margin = '2pt 0';
    });
    if (service.activities?.length) {
      appendText(card, 'h4', '', service.activityLabel || 'Most recorded');
      const list = element('ul', 'print-compact-list');
      service.activities.forEach((item) => appendText(list, 'li', '', `${item.label}: ${item.count}`));
      card.appendChild(list);
    }
    grid.appendChild(card);
  });
  section.appendChild(grid);
}

function renderFocus(root, focus) {
  if (!focus) return;
  const section = addSection(root, 'Weekly Focus');
  const card = element('div', 'print-focus-card');
  appendText(card, 'h3', '', focus.title || 'Weekly focus');
  if (focus.range) appendText(card, 'p', 'print-muted', focus.range);
  if (focus.focusArea) appendText(card, 'p', '', `Focus area: ${focus.focusArea}`);
  if (focus.whyMatters) appendText(card, 'p', '', focus.whyMatters);
  if (focus.nextSteps) appendText(card, 'p', '', `Next steps: ${focus.nextSteps}`);
  if (focus.goals?.length) {
    appendText(card, 'h4', '', 'Goals and practice');
    const list = element('ul', 'print-compact-list');
    focus.goals.forEach((goal) => {
      const details = [goal.title, goal.notes, goal.practiceSummary].filter(Boolean).join(' — ');
      appendText(list, 'li', '', details);
    });
    card.appendChild(list);
  }
  if (focus.days?.length) {
    addTable(card, [
      { key: 'day', label: 'Day' },
      { key: 'practiced', label: 'Practiced' },
      { key: 'prompt', label: 'Prompt level' },
      { key: 'note', label: 'Note' },
    ], focus.days);
  }
  section.appendChild(card);
}

function renderTrends(root, model) {
  const section = addSection(root, 'Clinical & Caregiver Trends');
  if (model.monthlyTrends?.length) {
    appendText(section, 'h3', '', 'Monthly daily-living and prompt trend');
    addTable(section, [
      { key: 'month', label: 'Month' },
      { key: 'hygiene', label: 'Hygiene yes' },
      { key: 'food', label: 'Food yes' },
      { key: 'cleanup', label: 'Clean-up yes' },
      { key: 'prompt', label: 'Avg prompt' },
    ], model.monthlyTrends);
  }
}

function renderMood(root, model) {
  const section = addSection(root, 'Daily Mood Check-Ins');
  addMetricGrid(section, model.moodMetrics || []);
  if (!model.moods?.length) {
    appendText(section, 'p', 'print-empty', 'No mood check-ins were recorded in this report range.');
    return;
  }
  addTable(section, [
    { key: 'timestamp', label: 'Timestamp' },
    { key: 'mood', label: 'Mood' },
    { key: 'intensity', label: 'Intensity' },
    { key: 'notes', label: 'Notes' },
  ], model.moods);
}

function renderCalendar(root, model) {
  const section = addSection(root, 'Health Calendar');
  appendText(section, 'p', 'print-muted', 'Chronological health and caregiver observations for the selected report range.');
  if (!model.calendarDays?.length) {
    appendText(section, 'p', 'print-empty', 'No calendar observations were recorded in this report range.');
    return;
  }
  addTable(section, [
    { key: 'date', label: 'Date' },
    { key: 'observations', label: 'Health / caregiver observations' },
    { key: 'moods', label: 'Mood' },
    { key: 'notes', label: 'Notes' },
  ], model.calendarDays);
}

function renderCaregiverEntries(root, entries = []) {
  const section = addSection(root, 'Complete Caregiver Check-Ins');
  if (!entries.length) {
    appendText(section, 'p', 'print-empty', 'No caregiver check-ins were recorded in this report range.');
    return;
  }
  entries.forEach((entry, index) => {
    const article = element('article', `print-record${index === 0 ? ' print-record-first' : ''}`);
    const header = element('header', 'print-record-header');
    appendText(header, 'h3', '', entry.title || 'Caregiver check-in');
    appendText(header, 'p', '', entry.subtitle || '');
    article.appendChild(header);
    (entry.sections || []).forEach((recordSection) => {
      const block = element('section', 'print-record-section');
      appendText(block, 'div', 'print-record-section-title', recordSection.title);
      const standardRows = (recordSection.rows || []).filter((row) => !row.note);
      const noteRows = (recordSection.rows || []).filter((row) => row.note);
      addTable(block, [
        { key: 'label', label: 'Question / field' },
        { key: 'value', label: 'Recorded answer' },
      ], standardRows, 'print-record-table');
      noteRows.forEach((row) => {
        const note = element('div', 'print-note-block');
        appendText(note, 'h4', '', row.label);
        appendText(note, 'p', '', row.value);
        block.appendChild(note);
      });
      article.appendChild(block);
    });
    section.appendChild(article);
  });
}

export function renderPrintableCaregiverReport(root, model = {}) {
  if (!root) throw new Error('A print report root is required.');
  root.replaceChildren();
  const header = element('header', 'print-report-header');
  appendText(header, 'p', 'print-report-kicker', 'STAR App');
  appendText(header, 'h1', '', model.title || 'Caregiver Report');
  appendText(header, 'p', 'print-report-subtitle', model.subtitle || 'Clinical and caregiver activity summary');
  addMetaGrid(header, [
    { label: 'Individual', value: model.individualName || 'Not specified' },
    { label: 'Report period', value: model.rangeLabel || 'All available data' },
    { label: 'Prepared', value: model.generatedAt || '—' },
  ]);
  root.appendChild(header);

  renderOverview(root, model);
  renderServices(root, model);
  renderFocus(root, model.focus);
  renderTrends(root, model);
  renderMood(root, model);
  renderCalendar(root, model);
  renderCaregiverEntries(root, model.caregiverEntries || []);

  appendText(root, 'p', 'print-legal-note', model.legalNote || 'This report summarizes information entered in the STAR App. Review clinical concerns with the appropriate licensed professional.');
  appendText(root, 'footer', 'print-confidential-footer', 'STAR App · Confidential caregiver report');
  root.setAttribute('aria-hidden', 'false');
  return root;
}
