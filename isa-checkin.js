// ISA measurement questions are generated from administrator-owned outcome cards.
// Keep them separate from physical health, medication and legacy check-in fields.
import { rest, getSessionFromStorage } from './restClient.js?v=2026.10.29UVM3';
import { ensureActiveGroupId } from './active-group.js?v=2026.10.29UVM3';

const $ = id => document.getElementById(id);
const el = (tag,cls,text) => {const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
let loaded=false, cards=[], rendered=[], linked=[], selectedAssignment=null;
function recordedValue(sourceField,measurement){
  const fields=[...document.querySelectorAll('[name]')].filter(x=>x.name===sourceField);
  const visible=fields.filter(x=>!x.disabled && !x.closest('.config-hidden') &&
    !x.closest('[hidden]') && !x.closest('[aria-hidden="true"]'));
  if(!visible.length)return null;
  const checked=visible.find(x=>(x.type==='radio'||x.type==='checkbox')&&x.checked);
  const field=checked||visible.find(x=>x.type!=='radio'&&x.type!=='checkbox');
  if(!field)return null;
  const raw=String(field.value??'').trim();
  if(!raw)return null;
  if(measurement.kind==='count'||measurement.kind==='duration'){
    if(!/^\\d+(?:\\.\\d+)?$/.test(raw))return null;
    const value=Number(raw);return Number.isFinite(value)&&value>=0?value:null;
  }
  if(measurement.kind==='boolean'){
    if(!['yes','no','true','false'].includes(raw.toLowerCase()))return null;
    return raw.toLowerCase()==='true'?'Yes':raw.toLowerCase()==='false'?'No':raw;
  }
  if(measurement.kind==='choice'&&Array.isArray(measurement.choices)&&measurement.choices.length){
    return measurement.choices.includes(raw)?raw:null;
  }
  return raw;
}
function collectEntries(){
 if(!loaded)return [];
 const items=[];
 for(const {card,measurement,control} of rendered){
  const raw=String(control.value ?? '').trim();
  // Empty means not answered, NOT zero, no participation, or decline.
  if(raw==='')continue;
  if((measurement.kind==='count'||measurement.kind==='duration') && (!Number.isFinite(Number(raw)) || Number(raw)<0))continue;
  items.push({
   outcome_id:card.id,outcome_title:card.title,outcome_version:card.version,
   outcome_category:card.category,measurement_id:measurement.id,
   measurement_label:measurement.label,activity:measurement.activity||'',
   answer_type:measurement.kind,unit:measurement.unit||'',
   frequency:measurement.frequency||'when_occurs',report_mode:measurement.report_mode||'summary',
   value:(measurement.kind==='count'||measurement.kind==='duration')?Number(raw):raw
  });
 }
 for(const {card,measurement,sourceField} of linked){
   const value=recordedValue(sourceField,measurement);
   if(value===null)continue; // Skipped, unanswered or hidden source is NOT zero.
   items.push({
     outcome_id:card.id,outcome_title:card.title,outcome_version:card.version,
     outcome_category:card.category,measurement_id:measurement.id,
     measurement_label:measurement.label,activity:measurement.activity||'',
     answer_type:measurement.kind,unit:measurement.unit||'',
     frequency:measurement.frequency||'when_occurs',report_mode:measurement.report_mode||'summary',
     assignment_id:selectedAssignment?.id||null,
     individual_id:selectedAssignment?.individual_id||null,
     source_field:sourceField,source_type:'admin_approved_checkin_reuse',
     value
   });
 }
 return items;
}
function restoreEntries(){
 const hidden=$('isa_entries');if(!loaded||!hidden)return;
 let entries=[];
 try{entries=JSON.parse(hidden.value||'[]');}catch{entries=[];}
 if(!Array.isArray(entries))entries=[];
 for(const {card,measurement,control} of rendered){
  const found=entries.find(e=>e.outcome_id===card.id&&e.measurement_id===measurement.id);
  control.value=found&&found.value!==null&&found.value!==undefined?String(found.value):'';
 }
 syncStored();
}
function syncStored(){
 const field=$('isa_entries');
 if(field)field.value=JSON.stringify(collectEntries());
}
function answerControl(m){
 let control;
 if(m.kind==='note'){
  control=el('textarea');control.rows=2;control.placeholder='What did you observe? (optional)';
 }else if(m.kind==='choice'||m.kind==='rating'||m.kind==='boolean'){
  control=el('select');
  control.add(new Option('Not answered / skip',''));
  const choices=m.kind==='boolean'?['Yes','No','Not observed']:(Array.isArray(m.choices)?m.choices:[]);
  choices.forEach(choice=>control.add(new Option(choice,choice)));
 }else{
  control=el('input');control.type='number';control.min='0';control.step='any';
  control.placeholder='Leave blank if unknown';control.inputMode='decimal';
 }
 control.style.cssText='width:100%;border:1px solid #c5ccd0;border-radius:10px;min-height:44px;padding:10px;font-size:16px;background:#fff;color:#26364b';
 control.setAttribute('aria-label',m.label);
 control.addEventListener('input',syncStored);
 control.addEventListener('change',syncStored);
 return control;
}
function render(){
 const host=$('starIsaCheckin');if(!host)return;
 host.replaceChildren();rendered=[];
 if(!cards.length){host.hidden=true;return;}
 host.hidden=false;
 const intro=el('p','','Record only what you observed. Leave other questions blank.');
 intro.style.cssText='font-size:14px;line-height:1.5;color:#596270;margin:0 0 12px';
 host.append(intro);
 const total=cards.length;
 cards.forEach((card,i)=>{
  const area=el('details','isa-outcome-card');
  area.open=i===0;
  area.style.cssText='margin:10px 0;padding:0;background:#fffdf8;border:1px solid #dfd8c9;border-radius:12px;overflow:hidden';
  const summary=el('summary','',card.title);
  summary.style.cssText='padding:14px 15px;font:700 16px/1.4 system-ui,sans-serif;color:#273449;cursor:pointer;list-style-position:inside';
  summary.setAttribute('aria-label', 'Outcome '+(i+1)+' of '+total+': '+card.title);
  area.append(summary);
  const body=el('div');body.style.cssText='padding:0 15px 13px';
  if(card.outcome_text||(Array.isArray(card.strategies)&&card.strategies.length)){
   const more=el('details');more.style.cssText='margin:5px 0 12px;font-size:13px;color:#58616d';
   const moreTitle=el('summary','','View goal and support strategies (optional)');
   moreTitle.style.cssText='padding:5px 0;cursor:pointer';
   more.append(moreTitle);
   if(card.outcome_text){const p=el('p','',card.outcome_text);p.style.cssText='font-size:13px;line-height:1.5;margin:8px 0';more.append(p);}
   (Array.isArray(card.strategies)?card.strategies:[]).forEach(s=>{
    const p=el('p','',s.text+(s.when?' · '+s.when:''));
    p.style.cssText='font-size:13px;line-height:1.5;margin:6px 0';more.append(p);
   });
   body.append(more);
  }
  for(const m of (Array.isArray(card.measurements)?card.measurements:[])){
   if(!m?.id||!m.label)continue;
   const approved=linked.some(x=>x.card.id===card.id&&x.measurement.id===m.id);
   if(approved)continue; // Admin approved reuse; never ask the same question again.
   const item=el('div');item.style.cssText='padding:9px 0 5px;border-top:1px solid #ece6dd';
   if(m.activity){const context=el('div','',m.activity);context.style.cssText='font-size:13px;color:#626a75;margin:0 0 5px';item.append(context);}
   const label=el('label','',m.label+(m.kind==='duration'?' ('+(m.unit||'minutes')+')':''));
   label.style.cssText='display:block;font-weight:650;font-size:15px;margin:4px 0 8px';
   const control=answerControl(m);
   label.append(control);item.append(label);body.append(item);
   rendered.push({card,measurement:m,control});
  }
  area.append(body);
  area.addEventListener('toggle',()=>{
   if(!area.open)return;
   host.querySelectorAll('details.isa-outcome-card').forEach(other=>{if(other!==area)other.open=false;});
  });
  host.append(area);
 });
 restoreEntries();
}
async function init(){
 const host=$('starIsaCheckin');if(!host)return;
 const session=getSessionFromStorage();if(!session?.user?.id)return;
 const group=await ensureActiveGroupId(session.user.id);if(!group)return;
 // Wait until the caregiver's own check-in configuration identifies the individual.
 if(!window.starCheckinAssignmentContext){
   await new Promise(resolve=>{
     const timeout=setTimeout(resolve,3500);
     window.addEventListener('star-caregiver-assignment-ready',()=>{clearTimeout(timeout);resolve();},{once:true});
   });
 }
 const context=window.starCheckinAssignmentContext||{};
 const assignmentRows=await rest('star_caregiver_checkin_assignments?select=*&active=eq.true&group_id=eq.'+
   encodeURIComponent(group)+'&caregiver_user_id=eq.'+encodeURIComponent(session.user.id)+'&order=created_at.asc');
 selectedAssignment=(assignmentRows||[]).find(x=>x.id===context.assignmentId)||null;
 const individualId=selectedAssignment?.individual_id||'';
 // Preserve historical group-level cards only for groups without per-person assignment.
 const rows=await rest('star_isa_outcomes?select=*&group_id=eq.'+encodeURIComponent(group)+
   '&status=eq.active&order=created_at.asc&limit=300');
 if(rows?.length>=300)throw new Error('Too many ISA outcomes to display safely.');
 cards=(rows||[]).filter(card=>{
   if(card.individual_id!==individualId)return false;
   const assignees=Array.isArray(card.assigned_user_ids)?card.assigned_user_ids:[];
   return !assignees.length||assignees.includes(session.user.id);
 });
 const allLinks=selectedAssignment?
  await rest('star_isa_measure_links?select=*&assignment_id=eq.'+encodeURIComponent(selectedAssignment.id)):[];
 const approved=allLinks||[];
 linked=[];
 for(const card of cards)for(const measurement of (Array.isArray(card.measurements)?card.measurements:[])){
   const link=approved.find(l=>l.outcome_id===card.id&&l.measurement_id===measurement.id);
   if(link)linked.push({card,measurement,sourceField:link.source_field});
 }
 loaded=true;render();
 window.starIsaHasAssignedOutcomes=rendered.length>0;
 window.starIsaReady=true;
 window.dispatchEvent(new Event('star-isa-outcomes-ready'));
}

document.addEventListener('DOMContentLoaded',()=>{
 window.starIsaCollectEntries=collectEntries;
 window.starIsaRestoreEntries=restoreEntries;
 window.starIsaReady=false;
 window.starIsaLoadFailed=false;
 const reload=()=>{loaded=false;cards=[];linked=[];rendered=[];init().catch(error=>{
  const host=$('starIsaCheckin');if(!host)return;
  host.hidden=false;host.replaceChildren(el('p','','ISA questions could not load. Refresh this page to try again. You can skip the ISA step if needed.'));
  window.starIsaLoadFailed=true;
  window.starIsaReady=true;
  window.dispatchEvent(new Event('star-isa-outcomes-ready'));
 });};
 reload();
 window.addEventListener('star-caregiver-assignment-ready',()=>{
   if(window.starIsaReady)reload();
 });
});