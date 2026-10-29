// ISA measurement questions are generated from administrator-owned outcome cards.
// Keep them separate from physical health, medication and legacy check-in fields.
import { rest, getSessionFromStorage } from './restClient.js?v=2026.10.29UVM3';
import { ensureActiveGroupId } from './active-group.js?v=2026.10.29UVM3';

const $ = id => document.getElementById(id);
const el = (tag,cls,text) => {const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
let loaded=false, cards=[], rendered=[];
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
 const session=getSessionFromStorage();
 if(!session?.user?.id)return;
 const group=await ensureActiveGroupId(session.user.id);
 if(!group)return;
 const query='star_isa_outcomes?select=*&group_id=eq.'+encodeURIComponent(group)+'&individual_id=eq.&status=eq.active&order=created_at.asc&limit=300';
 const rows=await rest(query);
 if(rows?.length>=300)throw new Error('Too many ISA outcomes to display safely.');
 cards=(rows||[]).filter(r=>{
  const assigned=Array.isArray(r.assigned_user_ids)?r.assigned_user_ids:[];
  return !assigned.length||assigned.includes(session.user.id);
 });
 loaded=true;render();
 window.starIsaHasAssignedOutcomes=cards.length>0;
 window.starIsaReady=true;
 window.dispatchEvent(new Event('star-isa-outcomes-ready'));
}
document.addEventListener('DOMContentLoaded',()=>{
 window.starIsaCollectEntries=collectEntries;
 window.starIsaRestoreEntries=restoreEntries;
 window.starIsaReady=false;
 window.starIsaLoadFailed=false;
 init().catch(error=>{
  const host=$('starIsaCheckin');if(!host)return;
  host.hidden=false;host.replaceChildren(el('p','','ISA questions could not load. Refresh this page to try again. You can skip the ISA step if needed.'));
  window.starIsaLoadFailed=true;
  window.starIsaReady=true;
  window.dispatchEvent(new Event('star-isa-outcomes-ready'));
 });
});