import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createIndividualVoiceReport} from './individual-voice-report.js';
class Node{constructor(){this.value='';this.children=[];this.style={};this.textContent='';}append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}addEventListener(){}}
const flatten=n=>(n.textContent||'')+' '+n.children.map(flatten).join(' ');
function setup(mixed=false){
 const nodes=new Map(['individualVoiceStart','individualVoiceEnd','individualVoicePeriod','individualVoiceCustomDates','individualVoicePeriodSummary','individualVoiceStatus','individualVoiceList','individualVoiceCopy'].map(id=>[id,new Node()]));
 const doc={getElementById:id=>nodes.get(id),createElement:()=>new Node()};
 const answers=[{id:'response',group_id:'team',individual_id:'jamie',checkin_date:'2026-11-08',is_fictional:true,response_type:'daily_experience',response_value:'Liked it',original_words:'FICTIONAL: Library visit'}];
 if(mixed)answers.push({...answers[0],id:'other',individual_id:'morgan',original_words:'PRIVATE OTHER PERSON'});
 const controller=createIndividualVoiceReport({document:doc,clock:()=>new Date(2026,10,8),rest:async path=>path.startsWith('star_individual_checkins_test')?answers:path.startsWith('star_individual_observations_test')?[]:[{id:'goal',group_id:'team',individual_id:'jamie',title:'Community activity'}]});
 return{nodes,controller};
}
test('Individual Voice automatically reads the linked person instead of blank individual ID',async()=>{const {nodes,controller}=setup();await controller.refresh('team');assert.match(flatten(nodes.get('individualVoiceList')),/Library visit/);assert.match(nodes.get('individualVoiceStatus').textContent,/1 check-in answer/);assert.match(await controller.letter({groupId:'team',individualId:'jamie'}),/Library visit/);});
test('explicit person selection keeps another individual out of the displayed and copied report',async()=>{const {nodes,controller}=setup(true);await controller.refresh('team','jamie');assert.match(flatten(nodes.get('individualVoiceList')),/Library visit/);assert.doesNotMatch(flatten(nodes.get('individualVoiceList')),/PRIVATE/);assert.doesNotMatch(await controller.letter({groupId:'team',individualId:'jamie'}),/PRIVATE/);});
test('ambiguous mixed-person data asks for a person instead of merging their answers',async()=>{const {nodes,controller}=setup(true);await controller.refresh('team');assert.match(nodes.get('individualVoiceStatus').textContent,/Choose one individual/);assert.equal(nodes.get('individualVoiceCopy').disabled,true);assert.doesNotMatch(flatten(nodes.get('individualVoiceList')),/PRIVATE/);});
