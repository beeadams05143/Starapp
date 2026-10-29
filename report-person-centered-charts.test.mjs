import assert from 'node:assert/strict';
import {buildIsaChartSeries,buildChoiceSatisfactionData} from './report-person-centered-charts.js';
import {buildIsaProgress} from './isa-progress-report-embedded.js';

const groupId='test-group',scope={groupId,individualId:'',start:'2026-10-01',end:'2026-10-29'};
const cards=[
  {id:'community',group_id:groupId,individual_id:'',title:'Choose a community activity',
    category:'Community Participation',status:'active'},
  {id:'phone',group_id:groupId,individual_id:'',title:'Practice supported phone call',
    status:'active'},
  {id:'leisure',group_id:groupId,individual_id:'',title:'Select a leisure activity',
    status:'active'}
];
const days=[1,2,3,5,6,7,9,10,11,13,14,15,17,18,19,21,22,23,25,26];
const community=[70,20,30,50,60,70,30,40,50,70,20,30,50,60,70,30,40,50,70,20];
const rows=days.map((day,i)=>({
  id:'record-'+i,group_id:groupId,date:'2026-10-'+String(day).padStart(2,'0'),
  payload:{isa_entries:[
    {outcome_id:'community',measurement_id:'minutes',measurement_label:'Minutes participating',
      answer_type:'duration',value:community[i],unit:'minutes'},
    {outcome_id:'phone',measurement_id:'steps',measurement_label:'Phone call steps completed',
      answer_type:'count',value:(i%3)+1,unit:'steps'},
    {outcome_id:'leisure',measurement_id:'participation',measurement_label:'Participation choice',
      answer_type:'choice',value:i===4||i===9?'Declined':'Participated',unit:''}
  ]}
}));
const report=buildIsaProgress(rows,cards,scope);
const communityChart=buildIsaChartSeries(report,'community','minutes');
assert.equal(communityChart.kind,'numeric');
assert.equal(communityChart.points.length,20);
assert.equal(communityChart.points[0].date,'2026-10-01');
assert.equal(communityChart.points[0].value,70);
assert.equal(communityChart.points.at(-1).date,'2026-10-26');
assert.equal(communityChart.unit,'minutes');
assert.doesNotMatch(JSON.stringify(communityChart),/achieved|score|pass\/fail/);
const phoneChart=buildIsaChartSeries(report,'phone','steps');
assert.equal(phoneChart.kind,'undefined-steps');
assert.match(phoneChart.reason,/does not name which steps/);
assert.ok(!phoneChart.points,'unnamed steps must not be plotted');
const leisureChart=buildIsaChartSeries(report,'leisure','participation');
assert.equal(leisureChart.kind,'categories');
assert.deepEqual(leisureChart.categories,
  [{label:'Participated',count:18},{label:'Declined',count:2}]);
assert.equal(buildIsaChartSeries(report,'nonexistent','minutes').kind,'empty');

const checkins=[
  {id:'a',group_id:groupId,individual_id:'',checkin_date:'2026-10-24',
    response_type:'daily_experience',response_value:'Liked it',
    original_words:'I liked the park',is_fictional:true},
  {id:'b',group_id:groupId,individual_id:'',checkin_date:'2026-10-29',
    response_type:'daily_experience',response_value:'Did not like',
    original_words:'',is_fictional:true},
  {id:'c',group_id:groupId,individual_id:'',checkin_date:'2026-10-26',
    response_type:'leisure_preference',response_value:'Coloring',
    offered_options:['Coloring','Music'],is_fictional:true},
  {id:'d',group_id:groupId,individual_id:'',checkin_date:'2026-10-28',
    response_type:'mood',response_value:'Tired',is_fictional:true},
  {id:'a',group_id:groupId,individual_id:'',checkin_date:'2026-10-24',
    response_type:'daily_experience',response_value:'Liked it',is_fictional:true},
  {id:'foreign',group_id:'other',individual_id:'',checkin_date:'2026-10-26',
    response_type:'daily_experience',response_value:'PRIVATE OTHER GROUP',is_fictional:true},
  {id:'other-person',group_id:groupId,individual_id:'other',checkin_date:'2026-10-26',
    response_type:'daily_experience',response_value:'PRIVATE OTHER PERSON',is_fictional:true},
  {id:'not-fictional',group_id:groupId,individual_id:'',checkin_date:'2026-10-26',
    response_type:'daily_experience',response_value:'PRIVATE NOT TEST',is_fictional:false},
  {id:'out-of-range',group_id:groupId,individual_id:'',checkin_date:'2026-09-01',
    response_type:'daily_experience',response_value:'PRIVATE OLD',is_fictional:true}
];
const results=buildChoiceSatisfactionData(checkins,scope);
assert.equal(results.satisfactionTotal,2);
assert.equal(results.choiceTotal,1);
assert.equal(results.activitiesUnspecified,1);
assert.deepEqual(results.satisfaction,[{label:'Liked it',count:1},{label:'Did not like',count:1}]);
assert.deepEqual(results.choices,[{label:'Coloring',count:1}]);
assert.equal(results.notes.length,3);
assert.doesNotMatch(JSON.stringify(results),/PRIVATE|Tired/);
const clipped=buildChoiceSatisfactionData(checkins,{...scope,start:'2026-10-27'});
assert.equal(clipped.satisfactionTotal,1);
assert.equal(clipped.choiceTotal,0);
const empty=buildChoiceSatisfactionData(checkins,{...scope,start:'2026-11-01',end:'2026-11-30'});
assert.equal(empty.satisfactionTotal,0);
assert.equal(empty.choiceTotal,0);
assert.throws(()=>buildChoiceSatisfactionData(checkins,{...scope,start:'2026-11-30',end:'2026-11-01'}),/Start date/);
console.log('STAR Test charts: ISA measurements, unnamed steps, choices, satisfaction, group/date isolation: PASS');
