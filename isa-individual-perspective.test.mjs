import assert from 'node:assert/strict';
import {buildIsaIndividualPerspective,formatIsaIndividualPerspectiveText} from './isa-individual-perspective.js';
const groupId='group-test',scope={groupId,individualId:'',start:'2026-10-01',end:'2026-10-29'};
const cards=[
  {id:'phone',group_id:groupId,individual_id:'',title:'Practice supported phone call'},
  {id:'leisure',group_id:groupId,individual_id:'',title:'Choose leisure activity'},
  {id:'other',group_id:'other',individual_id:'',title:'PRIVATE OTHER GROUP GOAL'}
];
const observations=[
  {id:'approved1',group_id:groupId,individual_id:'',created_at:'2026-10-28T12:00:00Z',
    review_status:'linked_observation',linked_outcome_id:'phone',
    original_words:'FICTIONAL: I tried calling the library.',response_choice:'I tried something',support_kind:'Helped me choose'},
  {id:'pending',group_id:groupId,individual_id:'',created_at:'2026-10-28T12:00:00Z',
    review_status:'pending',linked_outcome_id:null,original_words:'PRIVATE UNREVIEWED'},
  {id:'foreign',group_id:'other',individual_id:'',created_at:'2026-10-28T12:00:00Z',
    review_status:'linked_observation',linked_outcome_id:'phone',original_words:'PRIVATE OTHER GROUP'},
  {id:'falsegoal',group_id:groupId,individual_id:'',created_at:'2026-10-28T12:00:00Z',
    review_status:'linked_observation',linked_outcome_id:'other',original_words:'PRIVATE OTHER GOAL'},
  {id:'wrongperson',group_id:groupId,individual_id:'different',created_at:'2026-10-28T12:00:00Z',
    review_status:'linked_observation',linked_outcome_id:'phone',original_words:'PRIVATE OTHER INDIVIDUAL'}
];
const checkins=[
  {id:'feedback',group_id:groupId,individual_id:'',checkin_date:'2026-10-29',
    response_type:'daily_experience',response_value:'Did not like',original_words:'',
    offered_options:[],support_kind:'not_reported',is_fictional:true},
  {id:'choice',group_id:groupId,individual_id:'',checkin_date:'2026-10-26',
    response_type:'leisure_preference',response_value:'Coloring',
    original_words:'I want coloring.',offered_options:['Coloring','Music'],is_fictional:true},
  {id:'mood',group_id:groupId,individual_id:'',checkin_date:'2026-10-26',
    response_type:'mood',response_value:'Sad',is_fictional:true},
  {id:'wrong',group_id:'other',individual_id:'',checkin_date:'2026-10-29',
    response_type:'daily_experience',response_value:'PRIVATE OTHER GROUP FEEDBACK',is_fictional:true},
  {id:'notTest',group_id:groupId,individual_id:'',checkin_date:'2026-10-29',
    response_type:'daily_experience',response_value:'PRIVATE NOT FICTIONAL',is_fictional:false}
];
const result=buildIsaIndividualPerspective(observations,checkins,cards,scope);
assert.equal(result.reviewed.length,1);
assert.equal(result.feedback.length,2);
assert.equal(result.reviewed[0].goalTitle,'Practice supported phone call');
const letter=formatIsaIndividualPerspectiveText(result);
assert.match(letter,/FICTIONAL: I tried calling the library/);
assert.match(letter,/Administrator-reviewed/);
assert.match(letter,/Did not like.*Activity not specified/);
assert.match(letter,/I want coloring/);
assert.match(letter,/Choices offered: Coloring \/ Music/);
assert.doesNotMatch(letter,/PRIVATE|measured goal achievement|confirmed every step/i);
const outOfRange=buildIsaIndividualPerspective(observations,checkins,cards,{...scope,start:'2026-11-01',end:'2026-11-20'});
assert.equal(outOfRange.reviewed.length,0);
assert.equal(outOfRange.feedback.length,0);
assert.throws(()=>buildIsaIndividualPerspective(observations,checkins,cards,{groupId,start:'2026-11-20',end:'2026-10-01'}),/date range/);
console.log('Reviewed ISA quotes, activity feedback and group isolation: PASS');
