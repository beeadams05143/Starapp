import assert from 'node:assert/strict';
import {buildIndividualVoiceReport,formatIndividualVoiceText} from './individual-voice-report.js';

const scope={groupId:'test-group',individualId:'',start:'2026-10-24',end:'2026-10-29'};
const entry=(id,date,type,value,extra={})=>({
  id,group_id:'test-group',individual_id:'',checkin_date:date,is_fictional:true,
  response_type:type,response_value:value,support_kind:'not_reported',offered_options:[],...extra
});
const checkins=[
  entry('one','2026-10-24','mood','Happy'),
  entry('two','2026-10-25','comfort','Head',{support_kind:'Entered my answer'}),
  entry('three','2026-10-26','leisure_preference','Coloring',{
    offered_options:['Coloring','Music'],original_words:'I want coloring.',support_kind:'Helped me choose'
  }),
  entry('three','2026-10-26','leisure_preference','Coloring'),
  entry('four','2026-10-29','daily_experience','Did not like'),
  entry('private','2026-10-26','mood','PRIVATE OTHER GROUP',{group_id:'other-group'}),
  entry('other-person','2026-10-26','mood','PRIVATE PERSON',{individual_id:'different'}),
  entry('not-fictional','2026-10-26','mood','PRIVATE LIVE',{is_fictional:false}),
  entry('empty','2026-10-26','mood','')
];
const observations=[
  {id:'original',group_id:'test-group',individual_id:'',created_at:'2026-10-28T15:00:00Z',
    original_words:'FICTIONAL: I practiced calling a library.',response_choice:'I tried something',
    review_status:'pending',support_kind:'Read a question aloud'},
  {id:'linked',group_id:'test-group',individual_id:'',created_at:'2026-10-28T16:00:00Z',
    original_words:'FICTIONAL: I used Siri.',response_choice:'I did something',
    review_status:'linked_observation',linked_outcome_id:'outcome-a',support_kind:'not_reported'},
  {id:'foreign-observation',group_id:'other-group',created_at:'2026-10-28T16:00:00Z',
    original_words:'PRIVATE OTHER OBSERVATION'}
];
const cards=[{id:'outcome-a',group_id:'test-group',individual_id:'',title:'Communication ISA Goal'}];
const report=buildIndividualVoiceReport(checkins,observations,scope,cards);
assert.equal(report.checkinCount,4);
assert.equal(report.accomplishmentCount,2);
assert.equal(report.days,5);
const printed=formatIndividualVoiceText(report);
assert.match(printed,/Options offered: Coloring \/ Music/);
assert.match(printed,/Individual’s original words.*I want coloring/);
assert.match(printed,/Selected: Head/);
assert.match(printed,/Help with answering: Not reported/);
assert.match(printed,/Awaiting administrator review/);
assert.match(printed,/Communication ISA Goal \(not automatic progress\)/);
assert.match(printed,/Individual Voice \(FICTIONAL TEST DATA\)/);
assert.doesNotMatch(printed,/PRIVATE|achieved goal|demonstrated improvement/i);
assert.equal(buildIndividualVoiceReport(checkins,observations,{...scope,start:'2026-11-01',end:'2026-11-30'},cards).entries.length,0);
assert.throws(()=>buildIndividualVoiceReport(checkins,observations,{...scope,start:'2026-10-30',end:'2026-10-01'},cards),/date range/);
console.log('Individual Voice: voluntary answers, evidence, review separation, group boundaries and date scoping PASS');
