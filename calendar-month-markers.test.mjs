import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('./calendar.html', import.meta.url), 'utf8');

assert.match(html, /\.day,\s*\.calendar-day\{[^}]*flex-direction:column/);
assert.match(html, /\.day \.event-row\{[^}]*display:flex/);
assert.match(html, /\.day \.event-row\{[^}]*min-width:0/);
assert.match(html, /\.day \.dots\{[^}]*width:6px; height:6px/);
assert.match(html, /@media \(max-width: 640px\)\{[\s\S]*\.day \.dots\{ width:5px; height:5px/);
assert.doesNotMatch(html, /\.day \.dots\{[^}]*box-shadow/);
assert.match(html, /const eventSummary = items\.length[\s\S]*<span class="event-row"><span class="dots"/);
assert.doesNotMatch(html, /\(items\.length \? `<span class="dots"/);
assert.match(html, /<span class="event-title">\$\{firstTitle\}<\/span>/);
assert.match(html, /const moreLabel = items\.length > 1 \? `\+\$\{items\.length - 1\} more` : ""/);

const commonIphoneWidths = [320, 375, 390, 414];
for (const viewportWidth of commonIphoneWidths) {
  const mainPadding = 20;
  const paperPadding = 24;
  const gridPadding = 12;
  const totalGaps = 6 * 6;
  const cellWidth = (viewportWidth - mainPadding - paperPadding - gridPadding - totalGaps) / 7;
  const titleWidth = cellWidth - 5 - 3;
  assert.ok(titleWidth >= 23, `event title column too narrow at ${viewportWidth}px`);
}

console.log('calendar month markers: PASS');
