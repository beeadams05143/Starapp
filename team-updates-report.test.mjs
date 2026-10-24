import assert from 'node:assert/strict';
import { analyzeProviderRecords, renderProviderLetter, teamUpdateSectionsForLetter } from './caregiver-provider-letter.js';

const g = 'test-group';
const i = 'ben';
const updates = [
  {
    id: 'med', group_id: g, individual_id: i, category: 'medication',
    title: 'Nighttime medication regimen', details: '6:30 PM first planned step.\n7:30 PM second planned step.\n8:30 PM PRN step if ordered.',
    effective_date: '2026-10-19', source_note: 'Plan documented by administrator',
    status: 'active', closed_on: null,
  },
  {
    id: 'goal', group_id: g, individual_id: i, category: 'learning',
    title: 'Telephone skills', details: 'Practice placing a call with Siri.',
    effective_date: '2026-09-01', source_note: '', status: 'active', closed_on: null,
  },
  {
    id: 'other', group_id: g, individual_id: i, category: 'other',
    title: 'Updated support approach', details: 'Use short verbal prompts.',
    effective_date: '2026-10-03', status: 'active',
  },
  {
    id: 'different', group_id: 'other-group', individual_id: i, category: 'medication',
    title: 'PRIVATE_OTHER_GROUP', details: 'Must never show', effective_date: '2026-10-19', status: 'active',
  },
  {
    id: 'different-person', group_id: g, individual_id: 'other-person', category: 'other',
    title: 'PRIVATE_OTHER_PERSON', details: 'Must never show', effective_date: '2026-10-19', status: 'active',
  },
];
const october = {start: '2026-10-01', end: '2026-10-24'};
const sections = teamUpdateSectionsForLetter(updates, october.start, october.end);
assert.ok(sections.medication.some(v => v.includes('Nighttime medication regimen')));
assert.ok(sections.learning.some(v => v.includes('Ongoing since')));
assert.ok(sections.other.some(v => v.includes('Updated support approach')));
assert.ok(!teamUpdateSectionsForLetter(updates, '2026-11-01', '2026-11-30').medication.length);
assert.ok(teamUpdateSectionsForLetter(updates, '2026-11-01', '2026-11-30').learning.some(v => v.includes('Telephone skills')));
const closed = {...updates[1], status: 'closed', closed_on: '2026-10-15'};
assert.ok(teamUpdateSectionsForLetter([closed], '2026-10-01', '2026-10-24').learning.length);
assert.equal(teamUpdateSectionsForLetter([closed], '2026-11-01', '2026-11-30').learning.length, 0);

const analysis = analyzeProviderRecords([], {...october, groupId: g, individualId: i});
const letter = renderProviderLetter(analysis, {teamUpdates: updates});
assert.match(letter, /Medication Changes[\s\S]*Nighttime medication regimen/);
assert.match(letter, /Learning & Skill Development[\s\S]*Telephone skills/);
assert.match(letter, /Other Important Team Updates[\s\S]*Updated support approach/);
assert.match(letter, /6:30 PM first planned step\.\n7:30 PM second planned step/);
assert.doesNotMatch(letter, /PRIVATE_OTHER_GROUP|PRIVATE_OTHER_PERSON/);
console.log('STAR Team Updates: date scope, current goals, medication changes, confidentiality, letter integration: PASS');
