import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Controller-level DOM doubles: no network, accounts, camera, or microphone.
class Node {
  constructor(tag='div', text='') { this.tagName=tag; this.textContent=text; this.children=[]; this.attrs={}; this.value=''; this.style={}; this.disabled=false; this.events={}; }
  append(...nodes) { for(const node of nodes){node.parent=this;this.children.push(node);} }
  add(node){this.append(node);if(this.children.length===1)this.value=node.value;}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,fn){this.events[k]=fn;}
  focus(){}
  remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}
  matches(s){
    if(s.startsWith('#'))return this.id===s.slice(1);
    if(s.startsWith('[')){const [k,v]=s.slice(1,-1).split('=');return v===undefined?k in this.attrs:(k==='name'?this.name:this.attrs[k])===v.replaceAll('"','');}
    return this.tagName===s;
  }
  querySelectorAll(s){return this.children.flatMap(n=>[...(s.split(',').some(x=>n.matches(x))?[n]:[]),...n.querySelectorAll(s)]);}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  set innerHTML(s){
    this.replaceChildren();
    if(s.includes('data-remove-support'))for(const [tag,attr] of [['select','data-support'],['select','data-location'],['input','data-note'],['button','data-remove-support']]){const n=new Node(tag);n.attrs[attr]='';this.append(n);}
  }
}
const option=(label,value=label)=>Object.assign(new Node('option',label),{value});
const nodes=n=>[n,...n.children.flatMap(nodes)];
const text=n=>nodes(n).map(x=>x.textContent).join('\n');
const findButton=(root,label)=>nodes(root).find(n=>n.tagName==='button'&&n.textContent===label);
const team='c40d0ac1-0122-46f6-b358-fac283287bb5';
const jamie='58d3ac51-3dc7-4ead-b22f-8cb5829a3bac';
const taylor='490dbc4d-7fa6-40f0-a2c1-c0fa0d33a868';
const caregiver='ff639dab-4c75-4573-ad15-cfd3a8538101';
const momentSource=readFileSync(new URL('./star-moments-test.js',import.meta.url),'utf8');
async function moments(user,mode){
  const root=new Node('main');const calls=[];
  const records=[{id:'own-photo',label:'Library visit',category:'Community',created_at:new Date().toISOString(),photo:'data:image/jpeg;base64,QA',star_moment_responses_test:null}];
  const document={createElement:tag=>new Node(tag),querySelector:s=>s==='main'?root:root.querySelector(s)};
  const api=async(path,opts={})=>{
    calls.push({path,...opts});
    assert.equal(opts.expectedUserId,user,'every API request locks the signed-in identity');
    if(path.startsWith('star_moments_test_people'))return [{individual_id:jamie},{individual_id:taylor}];
    if(path.startsWith('profiles?'))return [{id:jamie,public_name:'test profile'},{id:taylor,public_name:'Taylor'}];
    if(path.startsWith('star_moment_notes_test'))return [{observation:'Seemed to enjoy it',note:'Caregiver-only observation'}];
    if(path.startsWith('star_moment_responses_test')){records[0].star_moment_responses_test={...JSON.parse(opts.body),reviewed_at:new Date().toISOString()};return [records[0].star_moment_responses_test];}
    if(path.startsWith('star_moments_test?id='))return [{photo:records[0].photo}];
    if(path.startsWith('star_moments_test?'))return structuredClone(records);
    throw Error('Unexpected API path '+path);
  };
  const spoken=[];
  const context=vm.createContext({document,window:{speechSynthesis:{cancel(){},speak:u=>spoken.push(u.text)}},SpeechSynthesisUtterance:class{constructor(text){this.text=text}},localStorage:{getItem:()=> 'on'},location:{search:'?mode='+mode,hostname:'star-uvm-testing.netlify.app'},URLSearchParams,
    SUPABASE_URL:'https://rjozzwmkvlndanoaghtc.supabase.co',requireSession:async()=>({user:{id:user}}),ensureActiveGroupId:async()=>team,rest:api});
  vm.runInContext(momentSource.replace(/^import .*;\n/gm,'').replace('start().catch(error=>announce(error.message));','globalThis.qa={start,questions,showReview,month};'),context);
  await context.qa.start();
  return {root,calls,records,spoken,qa:context.qa};
}
{
  const {root,calls,records,spoken}=await moments(jamie,'review');
  assert.match(spoken[0],/Library visit.*How was this/);
  await findButton(root,'🔊 Read to me').onclick();
  assert.equal(spoken.length,2);
  assert.ok(calls.some(c=>c.path.includes('individual_id=eq.'+jamie)));
  assert.doesNotMatch(text(root),/Caregiver-only|Seemed to enjoy/);
  assert.equal(root.querySelectorAll('textarea').length,1,'optional words and emoji choices share one page');
  assert.equal(findButton(root,'Save my choice ✓').disabled,true);
  await nodes(root).find(n=>n.attrs['aria-pressed']==='false').onclick();
  assert.equal(findButton(root,'Save my choice ✓').disabled,false);
  root.querySelector('textarea').value='I want the picture books.';
  root.querySelector('select').value='Answered after seeing choices';
  await root.querySelector('form').onsubmit({preventDefault(){}});
  assert.equal(records[0].star_moment_responses_test.words,'I want the picture books.');
  assert.equal(records[0].star_moment_responses_test.support,'Answered after seeing choices');
  assert.equal(records[0].star_moment_responses_test.again,null,'repeat question is optional and not invented');
  assert.match(text(root),/My choice is saved/);
  assert.ok(!calls.some(c=>c.path.startsWith('star_moment_notes_test')),'no caregiver observations fetched during individual answers');
}
{
  const {root,calls,records,qa}=await moments(taylor,'review');
  assert.ok(calls.some(c=>c.path.includes('individual_id=eq.'+taylor)),'another individual uses own profile');
  await findButton(root,'Not now').onclick();
  assert.equal(records[0].star_moment_responses_test.satisfaction,'Not now');
  await qa.showReview();
  await nodes(root).filter(n=>n.attrs['aria-pressed']==='false')[1].onclick();
  root.querySelector('select').value='';
  await root.querySelector('form').onsubmit({preventDefault(){}});
  assert.equal(records[0].star_moment_responses_test.support,null,'helper question is optional');
  assert.equal(calls.find(c=>c.method==='PATCH').path,'star_moment_responses_test?moment_id=eq.own-photo&satisfaction=eq.Not%20now');
}
{
  const {root,calls}=await moments(caregiver,'review');
  assert.match(text(root),/Fictional preview/);
  await findButton(root,'Not now').onclick();
  assert.ok(!calls.some(c=>c.method==='POST'||c.method==='PATCH'),'caregiver preview never submits individual answers');
}
{
  const {root}=await moments(caregiver,'add');
  assert.equal(root.querySelector('select').value,jamie);
  await findButton(root,'Continue').onclick();
  assert.equal(root.querySelector('input').attrs.capture,'environment');
  assert.equal(root.querySelectorAll('input').filter(n=>n.type==='file').length,2);
}
{
  const {root,records,qa}=await moments(caregiver,'month');
  records[0].star_moment_responses_test={satisfaction:'I liked it',again:'Yes',words:'Individual exact words',support:'Answered independently',reviewed_at:new Date().toISOString()};
  await findButton(root,'Continue').onclick();await findButton(root,'Library visit').onclick();
  assert.match(text(root),/Individual reported[\s\S]*Individual exact words[\s\S]*Caregiver observed[\s\S]*Caregiver-only observation/);
  records[0].star_moment_responses_test=null;await qa.month();await findButton(root,'Library visit').onclick();
  assert.doesNotMatch(text(root),/Caregiver-only observation/,'unanswered record does not display caregiver observation');
}
const checkin=readFileSync(new URL('./caregiver-checkin.html',import.meta.url),'utf8');
assert.ok(checkin.indexOf('id="shiftDetails"')<checkin.indexOf('id="physicalSection"'),'shared shift fields precede optional sections');
assert.match(checkin,/payload.shift_supports\s*=\s*supportRows/);
assert.match(checkin,/const supportEntries = parseJsonArray\(draft.data\[idx\]\?\.shift_supports\)/);
assert.match(checkin,/data\[idx\] = serialize\(step\)/,'draft retains every step');
const shared=new Node();shared.id='shiftDetails';const shift=new Node();shift.id='shiftSupports';shared.append(shift);
const rows=new Node();rows.attrs['data-support-rows']='';const hidden=new Node('input');hidden.name='shift_supports';
const add=new Node('button');add.attrs['data-add-support']='';shift.append(rows,hidden,add);
const date=Object.assign(new Node('input'),{name:'entry_date',value:'2026-11-02'});
const name=Object.assign(new Node('input'),{name:'caregiver_name',value:'Fictional caregiver'});shared.append(date,name);
const physical=new Node();physical.id='physicalSection';
const context=vm.createContext({document:{getElementById:id=>id==='shiftSupports'?shift:shared,createElement:t=>new Node(t)},Option:function(l,v){return option(l,v);}});
vm.runInContext(checkin.slice(checkin.indexOf("    const shiftSupports = document.getElementById('shiftSupports');"),checkin.indexOf('    function captureCurrentFormAsDraft()'))+'\nglobalThis.qa={addShiftSupport,readShiftSupports,serialize,hydrate};',context);
rows.replaceChildren();
const supportValues=[{support:'In-home support',location:'At home',note:'Morning routine'},{support:'Community support',location:'In the community',note:'Library'}];
supportValues.forEach(context.qa.addShiftSupport);
const draft=JSON.parse(JSON.stringify(context.qa.serialize(physical)));
assert.deepEqual(JSON.parse(draft.shift_supports),supportValues);
assert.equal(draft.entry_date,'2026-11-02');
date.value='';name.value='';context.qa.hydrate(physical,draft);
assert.equal(date.value,'2026-11-02');assert.equal(name.value,'Fictional caregiver');
rows.children[0].querySelector('[data-remove-support]').onclick();assert.equal(context.qa.readShiftSupports().length,1);
rows.children[0].querySelector('[data-remove-support]').onclick();assert.equal(rows.children.length,1);assert.equal(context.qa.readShiftSupports().length,0);

const report=readFileSync(new URL('./caregiver-report.html',import.meta.url),'utf8');
const host=new Node();host.id='shiftSupportReport';
for(const attr of ['person','from','through','support-summary','support-counts','support-dates','period']){const n=new Node(attr==='person'?'select':'div');n.attrs['data-'+attr]='';host.append(n);}
const fixtures=[['one','2026-11-01','j',supportValues],['two','2026-11-02','j',[supportValues[1]]],['old','2026-10-31','j',[supportValues[0]]],['other','2026-11-01','t',[supportValues[0]]]].map(([id,date,person,rows])=>({id,date,caregiver_name:'Alex',payload:{individual_id:person,individual_name:person==='j'?'Jamie Rivers':'Taylor',shift_supports:rows}}));
const reportContext=vm.createContext({document:{getElementById:()=>host,createElement:t=>new Node(t)},Option:function(l,v){return option(l,v);},cgState:{entries:fixtures},parseEntryDate:e=>new Date(e.date+'T12:00:00'),formatDateInputValue:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),formatCaregiverTableTimestamp:e=>e.date,getCaregiverName:e=>e.caregiver_name});
vm.runInContext(report.slice(report.indexOf("    const shiftSupportReport = document.getElementById('shiftSupportReport');"),report.indexOf('    function applyCaregiverFilters()'))+'\nglobalThis.render=renderShiftSupports;',reportContext);
host.querySelector('[data-from]').value='2026-11-01';host.querySelector('[data-through]').value='2026-11-02';reportContext.render();
assert.match(text(host.querySelector('[data-support-summary]')),/2 submitted/);
assert.match(text(host.querySelector('[data-support-counts]')),/Community support · 2 check-in/);
assert.match(text(host.querySelector('[data-support-dates]')),/Morning routine/);
assert.doesNotMatch(text(host.querySelector('[data-support-dates]')),/2026-10-31/);
host.querySelector('[data-person]').value='t';reportContext.render();assert.match(text(host.querySelector('[data-support-summary]')),/1 submitted/);
host.querySelector('[data-from]').value='2026-11-03';reportContext.render();assert.match(text(host.querySelector('[data-support-summary]')),/end date/);
console.log('UVM Moments controllers, profile scope, authentic responses, monthly separation, shift draft round-trip, dated reports, inclusive range and person filters: PASS');
