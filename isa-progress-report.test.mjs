import assert from 'node:assert/strict';
import {buildIsaProgress, formatIsaProgressText} from './isa-progress-report.js';

const groupId = 'star-group';
const cards = [
  {id:'goal-1',group_id:groupId,individual_id:'',category:'Safety',title:'Fire Safety',status:'active'},
  {id:'goal-2',group_id:groupId,individual_id:'',category:'Communication',title:'Phone Skills',status:'archived'},
  {id:'foreign',group_id:'other-group',individual_id:'',title:'PRIVATE FOREIGN CARD'}
];
const answer = (outcome,measure,value,label='Followed a safety instruction') => ({
  outcome_id:outcome,measurement_id:measure,value,measurement_label:label,
  outcome_title:outcome === 'goal-2' ? 'Phone Skills' : 'Fire Safety',
  answer_type:'choice'
});
const entries = [
  {id:'check-1',group_id:groupId,date:'2026-10-21',caregiver_name:'Caregiver A',payload:{
    isa_entries:[answer('goal-1','m1','Yes'), answer('goal-1','m2',0,'Number of prompts'),
      answer('goal-2','m3','Declined','Called a family member'),answer('goal-2','m4','','Blank answer')]
  }},
  {id:'check-1',group_id:groupId,date:'2026-10-21',payload:{isa_entries:[answer('goal-1','m1','Yes')]}},
  {id:'check-2',group_id:groupId,date:'2026-10-22',caregiver_name:'Caregiver B',submitted_at:'2026-10-23T01:00:00Z',payload:{
    isa_entries:[answer('goal-1','m1','Not observed'),answer('goal-2','m3','Not offered','Called a family member')]
  }},
  {id:'foreign',group_id:'other-group',date:'2026-10-22',payload:{isa_entries:[answer('goal-1','m1','PRIVATE OTHER GROUP')]}},
  {id:'other-person',group_id:groupId,individual_id:'another-person',date:'2026-10-22',payload:{isa_entries:[answer('goal-1','m1','PRIVATE OTHER PERSON')]}},
  {id:'undated',group_id:groupId,payload:{isa_entries:[answer('goal-1','m1','PRIVATE UNDATED')]}},
  {id:'empty',group_id:groupId,date:'2026-10-23',payload:{isa_entries:[]}}
];
const scope={groupId,start:'2026-10-21',end:'2026-10-22',individualId:''};
const report=buildIsaProgress(entries,cards,scope);
const txt=formatIsaProgressText(report);
assert.equal(report.answerCount,5,'counts actual answers including 0, not blank');
assert.equal(report.observationDays,2);
assert.equal(report.outcomes.length,2,'other group and person omitted');
assert.equal(report.outcomes.find(x=>x.id==='goal-2').status,'archived');
assert.match(txt,/2026-10-21 \| Caregiver A \| Number of prompts: 0/);
assert.match(txt,/Declined/);
assert.match(txt,/Not offered/);
assert.match(txt,/Not observed/);
assert.doesNotMatch(txt,/PRIVATE|automatically achieved|success rate|percent complete/i);
assert.equal(buildIsaProgress(entries,cards,{...scope,start:'2026-10-22'}).answerCount,2);
assert.equal(buildIsaProgress(entries,cards,{...scope,start:'2026-10-24',end:'2026-10-25'}).answerCount,0);
assert.throws(()=>buildIsaProgress(entries,cards,{...scope,start:'2026-10-31',end:'2026-10-01'}),/start date/);
assert.throws(()=>buildIsaProgress(entries,cards,{start:'2026-10-01'}),/group/);
const snap=buildIsaProgress([{id:'old',group_id:groupId,date:'2026-10-22',
  payload:{isa_entries:[answer('old-goal','old-measure','Needs support','Historical wording')]}}],[],scope);
assert.equal(snap.outcomes[0].status,'historical','old card observations survive archiving/removal');
assert.match(formatIsaProgressText(snap),/Historical wording: Needs support/);
console.log('ISA progress report: scoping, dates, values, archives, and evidence-only reporting: PASS');
