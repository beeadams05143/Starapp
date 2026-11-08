import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {questions,guideFields,blankAnswers,individualContent,validateEntry,personScope} from './communication-model.mjs';
const group='11111111-1111-4111-8111-111111111111',person='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
class Node {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.value='';this._text='';this.disabled=false;this.readOnly=false;this.className='';this.classList={add:v=>this.className+=' '+v};}
 append(...nodes){nodes.forEach(n=>{n.parent=this;this.children.push(n);});}
 replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
 set textContent(v){this._text=v;this.children=[];}get textContent(){return this._text+this.children.map(n=>n.textContent).join(' ');}
 setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}
 remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}
 querySelectorAll(selector){return this.children.flatMap(n=>[...(selector.split(',').some(s=>s==='[data-view]'?n.attrs['data-view']:n.tagName===s.toUpperCase())?[n]:[]),...n.querySelectorAll(selector)]);}
 focus(){}dispatchEvent(){this.oninput?.();}
}
async function setup({user='caregiver',dropResponse=false}={}){
 const nodes=Object.fromEntries(['content','back','person-label','person','identity','views','status'].map(id=>[id,new Node(id==='person'?'select':'div')]));
 for(const view of ['team','mine']){const b=new Node('button');b.attrs['data-view']=view;b.dataset={view};nodes.views.append(b);}
 const docRoot=new Node();docRoot.append(...Object.values(nodes));const doc={getElementById:id=>nodes[id],createElement:t=>new Node(t),querySelectorAll:s=>docRoot.querySelectorAll(s)};
 const calls=[],saved=[];let posts=0;
 const rest=async(path,options={})=>{calls.push({path,options});assert.equal(options.expectedUserId,user);if(path.startsWith('star_moments_test_people?'))return [{individual_id:person},{individual_id:other}];if(path.startsWith('group_members?'))return [{role:'admin'}];if(path.startsWith('profiles?'))return [{id:person,public_name:'Person A'},{id:other,public_name:'Person B'}];if(options.method==='POST'){posts++;const data=JSON.parse(options.body);saved.push(data);if(dropResponse)throw Error('Connection interrupted after save');return [{...data,version:1}];}if(path.includes('id=eq.')&&!path.includes('individual_id=eq.'))throw Error('Missing person scope');if(path.includes('?id=eq.'))return saved.filter(v=>path.includes(v.id));return [];};
 const context=vm.createContext({document:doc,window:{addEventListener(){},confirm:()=>true},location:{search:'',href:''},URLSearchParams,crypto:globalThis.crypto,Date,Event,Map,Promise,questions,guideFields,blankAnswers,individualContent,validateEntry,personScope,requireSession:async()=>({user:{id:user}}),ensureActiveGroupId:async()=>group,rest});
 let source=readFileSync('communication.js','utf8').replace(/^import .*;\n/gm,'');source=source.slice(0,source.lastIndexOf('init().catch'));
 vm.runInContext(source+'\nglobalThis.controller={init,renderMine,editGuide,load,saveEntry,briefing,setView:v=>view=v,getPerson:()=>person,setPerson:v=>person=v};',context);
 await context.controller.init();return {nodes,calls,saved,context,posts:()=>posts,find:(label)=>nodes.content.querySelectorAll('button').find(n=>n.textContent===label)};
}
test('optional answers start empty and never acquire suggested choices automatically',()=>{const a=blankAnswers();assert.deepEqual(individualContent(a,'Not recorded').answers,{});a.express.words='My exact words';a.choose.unsure=true;const result=individualContent(a,'Helper read choices');assert.equal(result.answers.express.words,'My exact words');assert.deepEqual(result.answers.choose.choices,[]);assert.equal(Object.keys(result.answers).length,2);assert.throws(()=>validateEntry('individual',{answers:{}}),/Choose/);});
test('scope rejects missing or malformed person identifiers',()=>{assert.match(personScope(group,person),new RegExp('individual_id=eq.'+person));assert.throws(()=>personScope(group,''));assert.throws(()=>personScope(group,'x&or=true'));});
test('team starts blank and selecting another individual clears previous content',async()=>{const app=await setup();assert.match(app.nodes.content.textContent,/No team guide/);assert.doesNotMatch(app.nodes.content.textContent,/Benny|Hudson/);app.nodes.person.value=other;await app.nodes.person.onchange();await new Promise(r=>setTimeout(r,0));assert.equal(app.context.controller.getPerson(),other);assert.match(app.nodes.identity.textContent,/Person B/);assert.ok(app.calls.filter(c=>c.path.startsWith('communication_')).every(c=>c.path.includes('group_id=eq.'+group)&&c.path.includes('individual_id=eq.')));});
test('guided choices retain exact words across questions and save once for selected person',async()=>{const app=await setup();app.context.controller.setView('mine');app.context.controller.renderMine();await app.find('🗣 Talk').onclick();const words=app.nodes.content.querySelectorAll('textarea')[0];words.value='Please wait for me';words.oninput();await app.find('Next question ›').onclick();await app.find('‹ Back').onclick();assert.equal(app.nodes.content.querySelectorAll('textarea')[0].value,'Please wait for me');await app.find('Save my answers').onclick();assert.equal(app.posts(),1);assert.equal(app.saved[0].individual_id,person);assert.equal(app.saved[0].kind,'individual');assert.equal(app.saved[0].content.answers.express.words,'Please wait for me');assert.match(app.nodes.content.textContent,/Your answers are saved/);});
test('lost POST response is verified by the same ID without creating another submission',async()=>{const app=await setup({dropResponse:true});await app.context.controller.saveEntry('individual',{answers:{express:{words:'My words'}}});assert.equal(app.posts(),1);assert.equal(app.saved.length,1);assert.ok(app.calls.some(c=>c.path.startsWith('communication_entries_test?id=eq.'+app.saved[0].id)));});
test('own account only offers its own profile and hides caregiver editing controls',async()=>{const app=await setup({user:person});assert.equal(app.nodes.person.children.length,1);assert.equal(app.nodes.person.disabled,true);assert.equal(app.find('Edit team guide'),undefined);assert.equal(app.find('📝 Record what helped'),undefined);});
test('implementation contains no personal plan defaults or embedded source document',()=>{for(const f of ['communication.js','communication-model.mjs','communication.html','sql/uvm/communication-supports.sql'])assert.doesNotMatch(readFileSync(f,'utf8'),/Benjamin|Benny|Hudson|Choiceworks|March 3, 2026|adult swing/i);});
