import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {supportMinutes,normalizeSupportEntries,buildSupportUsage} from './support-report.js';
import {checkinDateKey} from './caregiver-dates.js';
import {CaregiverSubmission} from './caregiver-submission.js';
import {createPersonCenteredCharts} from './report-person-centered-charts.js';
const scope={groupId:'ordinary-group',individualId:'ordinary-person',start:'2026-11-01',end:'2026-11-08'};
const row={id:'ordinary-record',user_id:'ordinary-caregiver',group_id:scope.groupId,date:'2026-11-07',caregiver_name:'A caregiver',payload:{entry_date:'2026-11-07',individual_id:scope.individualId,individual_name:'Alex',shift_supports:[{support:'In-home support',location:'At home',minutes:90},{support:'Community support',location:'In the community',minutes:45},{support:'Respite',location:'At home'}]}};
test('time distinguishes unknown from zero and rejects impossible values',()=>{
 for(const value of ['',null,undefined])assert.equal(supportMinutes(value),null);
 assert.equal(supportMinutes('0'),0);assert.equal(supportMinutes('90'),90);
 for(const value of ['-1','1.5','NaN','Infinity','1441',{},'1e3'])assert.throws(()=>supportMinutes(value));
 const entries=normalizeSupportEntries(JSON.stringify(row.payload.shift_supports));assert.equal(entries[2].minutes,null);
});
test('ordinary saved payload reports exact minutes, with no fixture or project requirement',()=>{
 const data=buildSupportUsage([row,row,{...row,id:'foreign',group_id:'other'},{...row,id:'person',payload:{...row.payload,individual_id:'other'}},{...row,id:'old',date:'2026-10-01'}],scope);
 assert.equal(data.entries,3);assert.equal(data.totalMinutes,135);assert.equal(data.missingTime,1);assert.equal(data.pairs.length,3);
 const zero=structuredClone(row);zero.payload.shift_supports=[{support:'Respite',location:'At home',minutes:0}];assert.equal(buildSupportUsage([zero],scope).missingTime,0);
 const invalid=structuredClone(row);invalid.payload.shift_supports[0].minutes='unrecorded';assert.equal(buildSupportUsage([invalid],scope).invalidTime,1);
});
test('production submission path saves and verifies supports, locations and minutes without changes',async()=>{
 const records=[];
 const service=new CaregiverSubmission({assertContext:r=>{assert.equal(r.group_id,scope.groupId);},newId:()=> 'attempt-ordinary',persistAttempt:()=>{},request:async(path,options)=>{
  if(options.method==='POST'){const saved=JSON.parse(options.body)[0];records.push(saved);return [saved];}
  if(path.includes('&id=eq.'))return records.filter(r=>path.includes('&id=eq.'+r.id+'&'));
  return [];
 }});
 const input=structuredClone(row);delete input.id;input.payload.shift_supports=normalizeSupportEntries(input.payload.shift_supports);
 const result=await service.submit(input,{confirmed:true});assert.equal(result.state,'verified');
 assert.deepEqual(records[0].payload.shift_supports,input.payload.shift_supports);
 const source=readFileSync('caregiver-report-supabase.js','utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 const context=vm.createContext({NOTE_FIELDS:[],checkinDateKey,console});vm.runInContext(source+'\nglobalThis.normalizeRow=normalizeSupabaseEntry;',context);
 const normalized=context.normalizeRow(records[0]);assert.equal(buildSupportUsage([normalized],scope).totalMinutes,135);
});
class Element{
 constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.style={};this.value='';this.classList={contains:()=>false};this.parentElement={hidden:false,style:{}};this.attrs={};}
 append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}setAttribute(k,v){this.attrs[k]=v;}addEventListener(type,fn){this.events??={};this.events[type]=fn;}
 get selectedOptions(){return this.children.filter(n=>n.value===this.value);}
}
const text=n=>(n.textContent||'')+' '+n.children.map(text).join(' ');
test('chart controller selects linked individual and displays ISA, satisfaction and support data together',async()=>{
 const elements=new Map(),doc={body:{dataset:{reportView:'charts'},classList:{contains:()=>false}},getElementById:id=>elements.get(id),createElement:tag=>new Element(tag,doc)};
 for(const id of ['pcGraphIndividual','pcGraphPeriod','pcGraphStart','pcGraphEnd','pcGraphCustom','pcGraphRangeStatus','pcGraphStatus','pcIsaChart','pcIsaChartStatus','pcIsaChartNote','pcIsaGraphMeasure','pcSatisfactionChart','pcActivityFeedbackList','pcLeisureChart','pcSatisfactionStatus','pcLeisureStatus','pcActivityContext','pcSupportUnit','pcSupportUsage'])elements.set(id,new Element('div',doc));
 elements.get('pcGraphPeriod').value='month';elements.get('pcSupportUnit').value='hours';
 const charts=[];globalThis.window={addEventListener(){}};globalThis.Chart=class{constructor(canvas,config){charts.push(config);}destroy(){}resize(){}};
 const card={id:'goal',group_id:scope.groupId,individual_id:scope.individualId,title:'Alex community goal',status:'active'};
 const recorded=structuredClone(row);recorded.payload.isa_entries=[{outcome_id:'goal',measurement_id:'duration',measurement_label:'Minutes participating',value:45,unit:'minutes',answer_type:'duration'}];
 const controller=createPersonCenteredCharts({document:doc,clock:()=>new Date(2026,10,8),rest:async path=>path.startsWith('star_isa_outcomes')?[card]:[{id:'voice',group_id:scope.groupId,individual_id:scope.individualId,checkin_date:'2026-11-07',response_type:'daily_experience',response_value:'Liked it',original_words:'Library visit',is_fictional:true}]});
 await controller.refresh(scope.groupId,[recorded]);
 assert.equal(elements.get('pcGraphIndividual').value,scope.individualId);assert.equal(elements.get('pcIsaGraphMeasure').children.length,1);
 assert.ok(charts.some(c=>c.type==='line'&&c.data.datasets[0].data[0]===45));assert.match(text(elements.get('pcActivityFeedbackList')),/Library visit/);
 assert.match(text(elements.get('pcSupportUsage')),/2.25 recorded hours/);assert.match(text(elements.get('pcSupportUsage')),/1 entries with time not recorded/);
});

test('check-in capture and recovery keep the minutes field, including blank and zero',()=>{
 const html=readFileSync('caregiver-checkin.html','utf8');
 const start=html.indexOf('    function readShiftSupports(){'),end=html.indexOf('    shiftSupports.querySelector',start);
 const makeRow=(minutes,support='Community support',location='In the community')=>({querySelector:s=>({value:({'[data-support]':support,'[data-location]':location,'[data-note]':'optional note','[data-minutes]':minutes})[s]})});
 const context=vm.createContext({shiftSupportRows:{children:[makeRow('45'),makeRow('0'),makeRow('')]},shiftSupportField:{}});
 vm.runInContext(html.slice(start,end)+'\nglobalThis.capture=readShiftSupports;globalThis.sync=syncShiftSupports;',context);
 context.sync();const restored=normalizeSupportEntries(context.shiftSupportField.value);assert.equal(restored[0].minutes,45);assert.equal(restored[1].minutes,0);assert.equal(restored[2].minutes,null);
 assert.match(html,/data-minutes.*min="0".*max="1440"/);assert.match(html,/\[data-minutes\]'\)\.value = values.minutes \?\? ''/);
});


test('ISA category controls use the exact linked card categories and never mix measurements between outcomes',async()=>{
 const {buildIsaProgress}=await import('./isa-progress-report-embedded.js');
 const {listIsaChartMetrics}=await import('./report-person-centered-charts.js');
 const cards=[{id:'one',group_id:scope.groupId,individual_id:scope.individualId,title:'Community choices',category:'Community Participation',status:'active'},{id:'two',group_id:scope.groupId,individual_id:scope.individualId,title:'My own request',category:'My custom category',status:'active'}];
 const recorded=structuredClone(row);recorded.payload.isa_entries=cards.map((c,i)=>({outcome_id:c.id,outcome_category:'Old snapshot category',outcome_title:'Old title',measurement_id:'m'+i,measurement_label:i?'Requests':'Participation minutes',answer_type:i?'count':'duration',value:i?2:45,unit:i?'requests':'minutes'}));
 const report=buildIsaProgress([recorded],cards,scope),metrics=listIsaChartMetrics(report);
 assert.equal(metrics.find(m=>m.goalId==='one').category,cards[0].category);assert.equal(metrics.find(m=>m.goalId==='two').category,cards[1].category);assert.equal(metrics.find(m=>m.goalId==='two').goalTitle,cards[1].title);
 const nodes=new Map(),doc={body:{dataset:{reportView:'charts'},classList:{contains:()=>false}},getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag,doc)};
 for(const id of ['pcGraphIndividual','pcGraphPeriod','pcGraphStatus','pcIsaChart','pcIsaChartStatus','pcIsaChartNote','pcIsaGraphMeasure','pcIsaGraphCategory','pcIsaGraphOutcome','pcIsaCardInfo'])nodes.set(id,new Element('div',doc));
 nodes.get('pcGraphPeriod').value='month';globalThis.window={addEventListener(){}};globalThis.Chart=class{constructor(){}destroy(){}resize(){}};
 const controller=createPersonCenteredCharts({document:doc,clock:()=>new Date(2026,10,8),rest:async path=>path.startsWith('star_isa_outcomes')?cards:[]});await controller.refresh(scope.groupId,[recorded]);
 assert.equal(nodes.get('pcIsaGraphCategory').value,'Community Participation');assert.match(nodes.get('pcIsaCardInfo').textContent,/Community choices/);
 nodes.get('pcIsaGraphCategory').value='My custom category';nodes.get('pcIsaGraphCategory').events.change();
 assert.equal(nodes.get('pcIsaGraphOutcome').value,'two');assert.equal(nodes.get('pcIsaGraphMeasure').children[0].textContent,'Requests');assert.match(nodes.get('pcIsaCardInfo').textContent,/My custom category/);assert.doesNotMatch(nodes.get('pcIsaCardInfo').textContent,/Old snapshot|Community choices/);
});
