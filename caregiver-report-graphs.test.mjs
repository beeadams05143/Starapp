import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildWeeklyPromptSeries,
  dateInputValue,
  defaultGraphRange,
  filterRecordsByRange,
  rangeFromInputs,
} from './caregiver-report-graphs.js';

const defaultRange = defaultGraphRange(new Date('2026-09-04T12:00:00'));
assert.equal(defaultRange.startInput, '2026-06-04');
assert.equal(defaultRange.endInput, '2026-09-04');

const range = rangeFromInputs('2026-06-04', '2026-09-04');
const records = [
  { id: 'before', date: '2026-06-03' },
  { id: 'start', date: '2026-06-04' },
  { id: 'inside', date: '2026-07-10' },
  { id: 'end', date: '2026-09-04' },
  { id: 'after', date: '2026-09-05' },
];
const filtered = filterRecordsByRange(records, range, (record) => new Date(`${record.date}T12:00:00`));
assert.deepEqual(filtered.map((record) => record.id), ['start', 'inside', 'end']);

const promptEntries = [
  { date: '2026-06-07', prompt: 1 },
  { date: '2026-06-08', prompt: 2 },
  { date: '2026-06-09', prompt: null },
  { date: '2026-06-14', prompt: 4 },
  { date: '2026-06-15' },
  { date: '2026-06-16', prompt: 2 },
];
const weekly = buildWeeklyPromptSeries(promptEntries, {
  getDate: (entry) => new Date(`${entry.date}T12:00:00`),
  getPrompt: (entry) => entry.prompt,
});
assert.equal(dateInputValue(new Date('2026-06-07T12:00:00')), '2026-06-07');
assert.deepEqual(
  weekly.map((row) => ({ key: row.key, average: row.average, count: row.count })),
  [
    { key: '2026-06-07', average: 1.5, count: 2 },
    { key: '2026-06-14', average: 3, count: 2 },
  ]
);

const html = await readFile(new URL('./caregiver-report.html', import.meta.url), 'utf8');
assert.equal((html.match(/class="[^"]*\breport-graph\b/g) || []).length, 6);
assert.match(html, /function initGraphControls\(\)/);
assert.match(html, /data-graph-start/);
assert.match(html, /data-graph-end/);
assert.match(html, /data-graph-print>Print Graph/);
assert.match(html, /function printGraph\(graphId\)/);
assert.match(html, /type:'line'/);
assert.match(html, /buildWeeklyPromptSeries\(entries/);
assert.doesNotMatch(html, /id="chartRangeSelect"/);
assert.doesNotMatch(html, /updateChartRangeLabels/);
assert.doesNotMatch(html, /showing placeholder data in charts/);

console.log('caregiver report graph helpers: PASS');
