import { rest, getSessionFromStorage } from './restClient.js?v=2026.10.29UVM2';
import { ensureActiveGroupId } from './active-group.js?v=2026.10.29UVM2';

const $ = id => document.getElementById(id);
const state = { groupId:null, userId:null, isAdmin:false, editing:null, records:[], strategies:[], measurements:[], members:[], selectedAssignees:[] };
const categories = {
 'Communication':['Expressing needs and preferences','Developing communication methods','Maintaining social connections'],
 'Home Living':['Participating in daily routines','Developing or maintaining home skills'],
 'Community Participation':['Exploring community interests','Participating in meaningful activities'],
 'Employment':['Exploring work opportunities','Developing workplace skills'],
 'Relationships':['Building and maintaining relationships'],
 'Health & Well-Being':['Participating in wellness routines'],
 'Self-Determination':['Making meaningful choices','Expressing personal preferences'],
 'Safety & Support':['Developing personal safety skills']
};
const val = id => String($(id)?.value ?? '').trim();
const el = (tag,cls,text) => {const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
function tell(msg,bad=false){$('isaStatus').textContent=msg;$('isaStatus').classList.toggle('error',bad);}
function setEditor(open){$('isaEditor').hidden=!open;if(open)$('isaEditor').scrollIntoView({behavior:'smooth',block:'start'});}
function bankOptions(){
 const selector=$('isaBankCategory');selector.replaceChildren();
 Object.keys(categories).forEach(k=>selector.add(new Option(k,k)));
 selector.add(new Option('+ Create Your Own Category','__custom'));
 bankChanged();
}
function bankChanged(){
 const category=val('isaBankCategory');
 const box=$('isaBankExample');box.replaceChildren();
 // The bank category is also the category of the card being created.
 // Selecting a different bank category intentionally updates the editable field.
 if (!$('isaEditor').hidden) $('isaCategory').value=category==='__custom'?'':category;
 if(category==='__custom'){box.add(new Option('Enter your own outcome below',''));return;}
 (categories[category]||[]).forEach(k=>box.add(new Option(k,k)));
}
function activeCardStatus(row){return row.status==='active'?'Active':row.status==='archived'?'Archived':'Draft';}
function renderList(){
 const host=$('isaList');host.replaceChildren();
 if(!state.records.length){host.append(el('p','muted','No ISA outcome cards yet. An administrator can create one from the bank or from scratch.'));return;}
 for(const item of state.records){
  const row=el('div','entry'), bar=el('div','bar'), title=el('h3','',item.title), badge=el('span','pill',activeCardStatus(item));
  bar.append(title,badge);row.append(bar);
  row.append(el('p','hint',item.category+' · '+(item.measurements||[]).length+' measurement(s) · '+(item.strategies||[]).length+' support strategy/strategies'));
  if(item.outcome_text)row.append(el('p','',item.outcome_text));
  if(item.voice_text)row.append(el('p','muted',(item.voice_source==='individual'?'Individual’s words: ':'Observed preference: ')+item.voice_text));
  if(state.isAdmin){const b=el('button','alt','Edit card');b.type='button';b.addEventListener('click',()=>openCard(item));row.append(b);}
  host.append(row);
 }
}
function blankCard(){
 state.editing=null;state.strategies=[];state.measurements=[];state.selectedAssignees=[];
 $('isaForm').reset();$('isaEditorTitle').textContent='New Personal Outcome Card';
 $('isaCategory').value=val('isaBankCategory')==='__custom'?'':val('isaBankCategory');$('isaCardStatus').value='draft';$('isaVoiceSource').value='none';
 renderStrategies();renderMeasurements();renderAssignees();updateKind();setEditor(true);
}
function openCard(card){
 if(!state.isAdmin)return;
 state.editing=card.id;state.strategies=Array.isArray(card.strategies)?structuredClone(card.strategies):[];
 state.measurements=Array.isArray(card.measurements)?structuredClone(card.measurements):[];
 state.selectedAssignees=Array.isArray(card.assigned_user_ids)?[...card.assigned_user_ids]:[];
 $('isaEditorTitle').textContent='Edit Personal Outcome Card';
 $('isaCategory').value=card.category||'';$('isaTitle').value=card.title||'';
 $('isaDescription').value=card.outcome_text||'';$('isaCardStatus').value=card.status||'draft';
 $('isaVoiceSource').value=card.voice_source||'none';$('isaVoice').value=card.voice_text||'';
 renderStrategies();renderMeasurements();renderAssignees();updateKind();setEditor(true);
}
function detailEntry(host,summary,onDelete) {
 const div=el('div','entry'), bar=el('div','bar');
 const msg=el('span','',summary),b=el('button','alt','Remove');b.type='button';
 b.addEventListener('click',onDelete);bar.append(msg,b);div.append(bar);host.append(div);
}
function renderStrategies(){
 const host=$('isaStrategies');host.replaceChildren();
 state.strategies.forEach((item,i)=>detailEntry(host,item.text+' · '+(item.who||'Team')+' · '+(item.when||'As needed')+' · '+(item.where||'Appropriate locations'),()=>{state.strategies.splice(i,1);renderStrategies();}));
}
function addStrategy(){
 const text=val('isaStrategyText');if(!text){tell('Describe the support strategy before adding it.',true);return;}
 state.strategies.push({id:crypto.randomUUID(),text,who:val('isaStrategyWho'),when:val('isaStrategyWhen'),where:val('isaStrategyWhere')});
 ['isaStrategyText','isaStrategyWho','isaStrategyWhen','isaStrategyWhere'].forEach(id=>$(id).value='');
 renderStrategies();tell('Support strategy added. Save the card to keep it.');
}
function updateKind(){
 const k=val('isaMetricKind');$('isaChoicesWrap').hidden=!(k==='choice'||k==='rating');
 $('isaUnitWrap').hidden=!(k==='count'||k==='duration');
 if(k==='rating')$('isaChoices').placeholder='1 - Starting, 2 - Developing, 3 - Consistent';
 else $('isaChoices').placeholder='Participated, Declined, Not offered';
}
function renderMeasurements(){
 const host=$('isaMetrics');host.replaceChildren();
 state.measurements.forEach((m,i)=>detailEntry(host,
  (m.activity?m.activity+' · ':'')+m.label+' ['+m.kind+(m.unit?' · '+m.unit:'')+']',()=>{state.measurements.splice(i,1);renderMeasurements();}));
}
function addMeasurement(){
 const label=val('isaMetricLabel'),kind=val('isaMetricKind'),activity=val('isaActivity');
 if(!label){tell('Name the measurement before adding it.',true);return;}
 const choices=val('isaChoices').split(',').map(s=>s.trim()).filter(Boolean);
 if((kind==='choice'||kind==='rating') && choices.length<2){tell('Add at least two answer choices for this measurement.',true);return;}
 const item={id:crypto.randomUUID(),activity,label,kind,choices:(kind==='choice'||kind==='rating')?choices:[],unit:(kind==='count'||kind==='duration')?val('isaUnit'):'',frequency:val('isaMetricFrequency'),report_mode:val('isaReportMode')};
 state.measurements.push(item);['isaActivity','isaMetricLabel','isaChoices'].forEach(id=>$(id).value='');
 renderMeasurements();tell('Measurement added. Save the card to keep it.');
}
function renderAssignees(){
 const host=$('isaAssignees');host.replaceChildren();
 if(!state.members.length){host.append(el('p','hint','Caregivers in the active group will be able to document this outcome.'));return;}
 for(const m of state.members){
  const label=el('label'),box=document.createElement('input');box.type='checkbox';box.value=m.user_id;box.checked=state.selectedAssignees.includes(m.user_id);
  box.addEventListener('change',()=>{state.selectedAssignees=state.members.map(x=>x.user_id).filter(id=>host.querySelector('input[value="'+id+'"]')?.checked);});
  label.append(box,document.createTextNode(m.name));host.append(label);
 }
}
async function individualName(){
 try{
  const records=await rest('caregiver_checkin_configs?select=selected_items&group_id=eq.'+encodeURIComponent(state.groupId)+'&order=updated_at.desc&limit=10');
  for(const r of records||[]){const p=r.selected_items?.__individual_profile__;const name=p?.preferred_name||p?.display_name||p?.full_name||p?.name;if(name)return name;}
 }catch(e){console.warn('Unable to read individual name',e?.message);}
 return 'Individual';
}
async function loadMembers(){
 try {
  const members=await rest('group_members?select=user_id,role&group_id=eq.'+encodeURIComponent(state.groupId));
  const ids=(members||[]).map(m=>m.user_id);
  let profiles=[];
  if(ids.length){
   try{profiles=await rest('profiles?select=id,display_name,full_name,public_name&id=in.('+ids.join(',')+')');}
   catch(e){console.warn('Team member names unavailable',e?.message);}
  }
  state.members=(members||[]).map((m,i)=>{const p=profiles.find(x=>x.id===m.user_id);return {...m,name:p?.public_name||p?.display_name||p?.full_name||('Team member '+(i+1))};});
 } catch(e){console.warn('Unable to load group membership display',e?.message);state.members=[];}
}
async function loadCards(){
 const records=await rest('star_isa_outcomes?select=*&group_id=eq.'+encodeURIComponent(state.groupId)+'&individual_id=eq.&order=created_at.asc&limit=500');
 if(records?.length>=500)throw new Error('Too many outcome cards to load safely. Contact the administrator.');
 state.records=records||[];renderList();
 tell(state.records.length+' ISA outcome card(s) loaded.');
}
async function saveCard(e){
 e.preventDefault();
 if(!state.isAdmin)return;
 $('isaSave').disabled=true;
 try{
  const current=await ensureActiveGroupId(state.userId);
  if(current!==state.groupId)throw new Error('Active group changed. Reload before saving.');
  const category=val('isaCategory'),title=val('isaTitle');
  if(!category||!title)throw new Error('Category and title are required.');
  const values={
   category,title,outcome_text:val('isaDescription'),voice_source:val('isaVoiceSource'),
   voice_text:val('isaVoice'),strategies:state.strategies,measurements:state.measurements,
   assigned_user_ids:state.selectedAssignees,status:val('isaCardStatus')
  };
  if(values.status==='active'&&!values.measurements.length)throw new Error('Add at least one measurement before activating this card.');
  if(values.voice_source==='none')values.voice_text='';
  const opts={method:state.editing?'PATCH':'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(state.editing?values:{...values,group_id:state.groupId,individual_id:''})};
  await rest('star_isa_outcomes'+(state.editing?'?id=eq.'+encodeURIComponent(state.editing)+'&group_id=eq.'+encodeURIComponent(state.groupId):''),opts);
  setEditor(false);await loadCards();tell('Outcome card saved. Active cards now drive the ISA questions in caregiver check-ins.');
 }catch(error){tell(error.message||'Unable to save the outcome.',true);}
 finally{$('isaSave').disabled=false;}
}
async function start(){
 const session=getSessionFromStorage();if(!session?.user?.id){location.replace('auth.html');return;}
 state.userId=session.user.id;
 state.groupId=await ensureActiveGroupId(state.userId);
 if(!state.groupId)throw new Error('Please choose or join a group first.');
 $('isaGroup').textContent=localStorage.getItem('currentGroupName')||'Current STAR group';
 const roles=await rest('group_members?select=role&group_id=eq.'+encodeURIComponent(state.groupId)+'&user_id=eq.'+encodeURIComponent(state.userId)+'&limit=1');
 state.isAdmin=roles?.[0]?.role==='admin';
 $('isaPermission').textContent=state.isAdmin?'Administrator: you can add, activate, edit and archive outcome cards.':'Team member: read-only outcome cards.';
 $('isaNew').hidden=!state.isAdmin;
 $('isaEvidenceLinks').hidden=!state.isAdmin;
 const name=await individualName();$('isaIndividual').replaceChildren(new Option(name,''));
 await loadMembers();await loadCards();
}
document.addEventListener('DOMContentLoaded',()=>{
 bankOptions();
 $('isaBankCategory').addEventListener('change',bankChanged);
 $('isaUseExample').addEventListener('click',()=>{
  const category=val('isaBankCategory'),title=val('isaBankExample');
  if(category==='__custom'){$('isaCategory').value='';$('isaCategory').focus();return;}
  $('isaCategory').value=category;$('isaTitle').value=title;
  $('isaDescription').value='';$('isaTitle').focus();
 });
 $('isaBlank').addEventListener('click',()=>{const category=val('isaBankCategory');$('isaCategory').value=category==='__custom'?'':category;$('isaTitle').value='';$('isaDescription').value='';(category==='__custom'?$('isaCategory'):$('isaTitle')).focus();});
 $('isaNew').addEventListener('click',blankCard);
 $('isaCancel').addEventListener('click',()=>setEditor(false));
 $('isaAddStrategy').addEventListener('click',addStrategy);
 $('isaAddMetric').addEventListener('click',addMeasurement);
 $('isaMetricKind').addEventListener('change',updateKind);
 $('isaForm').addEventListener('submit',saveCard);
 start().catch(e=>tell(e.message||'Unable to open ISA Outcomes.',true));
});