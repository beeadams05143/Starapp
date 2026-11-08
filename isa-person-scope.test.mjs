import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createIsaProgressReport,buildIsaProgress,resolveIsaIndividual} from './isa-progress-report-embedded.js';
import {scopeUvmIsaCards} from './uvm-report-scope.js';
const group='c40d0ac1-0122-46f6-b358-fac283287bb5',jamie='58d3ac51-3dc7-4ead-b22f-8cb5829a3bac';
const url='https://rjozzwmkvlndanoaghtc.supabase.co';
const cards=[{id:'j',group_id:group,individual_id:jamie,title:'Jamie activity'},{id:'m',group_id:group,individual_id:'morgan',title:'Morgan activity'},{id:'t',group_id:group,individual_id:'taylor',title:'Taylor activity'},{id:'f9e7beb4-a4eb-4c14-b890-957b6444ea9a',group_id:group,individual_id:'',title:'Communicating Feelings'}];
class Node{constructor(){this.children=[];this.value='';this.style={};this.textContent=''}append(...nodes){this.children.push(...nodes)}replaceChildren(){this.children=[]}addEventListener(){}}
const text=n=>n.textContent+' '+n.children.map(text).join(' ');
test('embedded screen and exported text include only Jamie, even without check-ins',async()=>{
 const elements=new Map(['isaProgressStart','isaProgressEnd','isaProgressPeriod','isaCustomDates','isaPeriodSummary','isaProgressList','isaProgressStatus','isaProgressCopy','isaProgressPrint'].map(id=>[id,new Node()]));
 const doc={getElementById:id=>elements.get(id),createElement:()=>new Node()};
 const controller=createIsaProgressReport({rest:async()=>cards,document:doc,mapCards:(items,g)=>scopeUvmIsaCards(items,url,g),clock:()=>new Date(2026,10,7)});
 await controller.refresh(group,[],jamie);
 assert.match(text(elements.get('isaProgressList')),/Jamie activity/);assert.match(text(elements.get('isaProgressList')),/Communicating Feelings/);
 assert.doesNotMatch(text(elements.get('isaProgressList')),/Morgan|Taylor/);
 const letter=await controller.letter({groupId:group,individualId:jamie});assert.doesNotMatch(letter,/Morgan|Taylor/);
 await assert.rejects(controller.letter({groupId:group,individualId:'morgan'}),/individual changed/);
 assert.equal(cards[3].individual_id,'','legacy ownership is not mutated');
});
test('cross-person answer references cannot reappear as historical goals',()=>{
 const rows=[{id:'r',group_id:group,individual_id:jamie,date:'2026-11-07',payload:{isa_entries:[{outcome_id:'m',measurement_id:'m1',outcome_title:'Morgan activity',value:'Wrong person'}]}}];
 const report=buildIsaProgress(rows,cards,{groupId:group,individualId:jamie});assert.equal(report.answerCount,0);assert.doesNotMatch(JSON.stringify(report),/Morgan|Taylor/);
});
test('unselected mixed-person data is rejected',()=>{
 assert.throws(()=>resolveIsaIndividual([{individual_id:jamie},{individual_id:'morgan'}],cards),/Choose one individual/);
});
