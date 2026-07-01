import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderPrintableCaregiverReport } from './caregiver-report-print.js';

class TestNode {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.className = '';
    this.textContent = '';
    this.style = {};
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

globalThis.document = {
  createElement: (tagName) => new TestNode(tagName),
};

const root = new TestNode('div');
const longNote = Array.from(
  { length: 40 },
  (_, index) => `Long caregiver note line ${index + 1}`
).join('\n');

renderPrintableCaregiverReport(root, {
  title: 'STAR Caregiver Report',
  individualName: 'Test Individual',
  rangeLabel: 'June 1, 2026 – June 30, 2026',
  generatedAt: 'June 30, 2026 at 9:00 AM',
  overviewMetrics: [{ label: 'Caregiver check-ins', value: 2 }],
  summaryLines: ['Data-derived report summary.'],
  weeklyAverages: [{ label: 'Combined', value: '3.5 h/wk' }],
  services: [{ title: 'Vocational', metrics: [{ label: 'Sessions', value: 2 }] }],
  focus: { title: 'Weekly focus', goals: [{ title: 'Goal one', practiceSummary: '2 practices' }] },
  movementMetrics: [{ label: 'Days with symptoms', value: 1 }],
  monthlyTrends: [{ month: '2026-06', hygiene: 3, food: 2, cleanup: 2, prompt: 1 }],
  moodMetrics: [{ label: 'Mood check-ins', value: 1 }],
  moods: [{ timestamp: 'June 4, 2026 at 8:30 AM', mood: 'Happy', intensity: 7, notes: 'Good morning.' }],
  calendarDays: [{ date: 'June 4, 2026', observations: '8 hours sleep', moods: 'Happy (7)', notes: 'Good morning.' }],
  caregiverEntries: [{
    title: 'Caregiver Check-In — June 4, 2026',
    subtitle: 'Caregiver A · Submitted June 4, 2026 at 9:00 AM',
    sections: [
      { title: 'Physical Health', rows: [{ label: 'Appears tired?', value: 'No' }] },
      { title: 'Notes', rows: [{ label: 'Caregiver notes', value: longNote, note: true }] },
    ],
  }],
});

const collectText = (node) => [
  node.textContent,
  ...node.children.flatMap(collectText),
].filter(Boolean).join('\n');

const renderedText = collectText(root);
[
  'STAR Caregiver Report',
  'Report Overview',
  'Weekly Focus',
  'Clinical & Caregiver Trends',
  'Daily Mood Check-Ins',
  'Health Calendar',
  'Complete Caregiver Check-Ins',
  'Appears tired?',
  'Long caregiver note line 40',
  'Submitted June 4, 2026 at 9:00 AM',
].forEach((expected) => assert.match(renderedText, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));

assert.equal(root.attributes.get('aria-hidden'), 'false');
assert.doesNotMatch(renderedText, /navigation|bottom tabs|floating button/i);
assert.doesNotMatch(renderedText, /Services Summary|Weekly averages/i);

const css = await readFile(new URL('./caregiver-report-print.css', import.meta.url), 'utf8');
assert.match(css, /@page\s*{[\s\S]*size:\s*Letter portrait;/);
assert.match(css, /body\.print-document-active\s*>\s*:not\(#print-report\)/);
assert.match(css, /\.print-note-block p[\s\S]*white-space:\s*pre-wrap;/);
assert.match(css, /break-inside:\s*avoid-page;/);

console.log('caregiver report print renderer: PASS');
