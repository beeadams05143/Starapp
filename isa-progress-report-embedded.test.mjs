import assert from 'node:assert/strict';
import {buildIsaProgress, formatIsaProgressText} from './isa-progress-report-embedded.js';

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
assert.match(txt,/Number of prompts: 0 recorded on one date/);
assert.match(txt,/Declined/);
assert.match(txt,/Not offered/);
assert.match(txt,/Not observed/);
assert.doesNotMatch(txt,/PRIVATE|automatically achieved|success rate|percent complete/i);
assert.doesNotMatch(txt,/2026-10-21.*Caregiver/, 'provider letter must not dump daily records');
assert.equal(buildIsaProgress(entries,cards,{...scope,start:'2026-10-22'}).answerCount,2);
assert.equal(buildIsaProgress(entries,cards,{...scope,start:'2026-10-24',end:'2026-10-25'}).answerCount,0);
assert.throws(()=>buildIsaProgress(entries,cards,{...scope,start:'2026-10-31',end:'2026-10-01'}),/start date/);
assert.throws(()=>buildIsaProgress(entries,cards,{start:'2026-10-01'}),/group/);
const snap=buildIsaProgress([{id:'old',group_id:groupId,date:'2026-10-22',
  payload:{isa_entries:[answer('old-goal','old-measure','Needs support','Historical wording')]}}],[],scope);
assert.equal(snap.outcomes[0].status,'historical','old card observations survive archiving/removal');
assert.match(formatIsaProgressText(snap),/Historical wording:.*Needs support/);

// Regression: a month of 60 fictional daily ISA answers must fit into a concise letter.
const days=[1,2,3,5,6,7,9,10,11,13,14,15,17,18,19,21,22,23,25,26];
const community=[70,20,30,50,60,70,30,40,50,70,20,30,50,60,70,30,40,50,70,20];
const repeated=days.map((day,i)=>({
  id:'sample-'+day,group_id:groupId,date:'2026-10-'+String(day).padStart(2,'0'),
  caregiver_name:'Cedar Grove Demo Caregiver (fictional)',payload:{isa_entries:[
    {outcome_id:'community',measurement_id:'minutes',outcome_title:'Choose a community activity',
      outcome_category:'Community Participation',measurement_label:'Minutes participating',
      value:community[i],unit:'minutes',activity:'Fictional community outing'},
    {outcome_id:'phone',measurement_id:'steps',outcome_title:'Practice making a supported phone call',
      outcome_category:'Communication',measurement_label:'Phone call steps completed',
      value:(i%3)+1,unit:'steps',activity:'Mock phone practice'},
    {outcome_id:'leisure',measurement_id:'choice',outcome_title:'Select a preferred leisure activity',
      outcome_category:'Self-Direction',measurement_label:'Participation choice',
      value:[4,9].includes(i)?'Declined':'Participated',activity:'Fictional leisure activity'}
  ]}
}));
const monthReport=buildIsaProgress(repeated,[],{groupId,start:'2026-10-01',end:'2026-10-29',individualId:''});
const monthText=formatIsaProgressText(monthReport);
assert.equal(monthReport.answerCount,60);
assert.equal(monthReport.observationDays,20);
assert.match(monthText,/20 to 70 minutes per reported date/);
assert.match(monthText,/averaging 46\.5 minutes per reported date/);
assert.match(monthText,/Across 20 reported dates/);
assert.doesNotMatch(monthText,/46\.5 minutes per month/);
assert.match(monthText,/1 to 3 steps completed per reported date/);
assert.match(monthText,/do not specify which steps were completed/);
assert.doesNotMatch(monthText,/average 2 steps/);
assert.match(monthText,/“Participated” 18 times/);
assert.match(monthText,/“Declined” twice/);
assert.doesNotMatch(monthText,/2026-10-01 \|/);
assert.doesNotMatch(monthText,/Cedar Grove Demo Caregiver/);
assert.ok(monthText.length<2000,'60 entries must produce a short readable letter');
assert.equal(monthReport.outcomes.flatMap(o=>o.observations).length,60,
  'daily evidence must remain intact in report data');

const sameDay=buildIsaProgress([
  {id:'same-day-1',group_id:groupId,date:'2026-10-21',
    payload:{isa_entries:[{outcome_id:'training',measurement_id:'duration',
      outcome_title:'Skill practice',measurement_label:'Minutes practiced',unit:'minutes',value:10}]}},
  {id:'same-day-2',group_id:groupId,date:'2026-10-21',
    payload:{isa_entries:[{outcome_id:'training',measurement_id:'duration',
      outcome_title:'Skill practice',measurement_label:'Minutes practiced',unit:'minutes',value:20}]}}
],[],scope);
assert.match(formatIsaProgressText(sameDay),/2 recorded responses across 1 date/);
assert.match(formatIsaProgressText(sameDay),/averaging 15 minutes per recorded response/);
assert.doesNotMatch(formatIsaProgressText(sameDay),/15 minutes per reported date/);

console.log('Monthly ISA narrative regression: 60 entries summarized without dumping dates: PASS');

console.log('ISA progress report: scoping, dates, values, archives, and evidence-only reporting: PASS');
