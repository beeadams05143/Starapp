// ISA measurement questions are generated from administrator-owned outcome cards.
// Keep them separate from physical health, medication and legacy check-in fields.
import { rest, getSessionFromStorage } from './restClient.js?v=2026.10.19B';
import { ensureActiveGroupId } from './active-group.js?v=2026.10.07A';

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
 if(!cards.length){host.hidden=true;syncStored();return;}
 host.hidden=false;
 const heading=el('h2','','⭐ ISA Activities & Progress');heading.style.fontSize='23px';
 host.append(heading,el('p','','Only your assigned outcomes appear here. These questions are separate from Health & Well-Being.'));
 for(const card of cards){
  const area=el('section');area.style.cssText='margin:12px 0;padding:14px;background:#fffdf8;border:1px solid #dfd8c9;border-radius:14px';
  const title=el('h3','',card.title);title.style.margin='0 0 8px';area.append(title);
  if(card.outcome_text){const description=el('p','',card.outcome_text);description.style.fontSize='14px';area.append(description);}
  const supports=Array.isArray(card.strategies)?card.strategies:[];
  supports.forEach(s=>{const p=el('p','',s.text+(s.when?' · '+s.when:''));p.style.cssText='color:#5c6370;font-size:13px;margin:6px 0';area.append(p);});
  for(const m of (Array.isArray(card.measurements)?card.measurements:[])){
   if(!m?.id||!m.label)continue;
   const item=el('div');item.style.cssText='padding:10px 0;border-top:1px solid #eee7dc';
   if(m.activity){const activity=el('div','',m.activity);activity.style.cssText='font-size:13px;color:#606875';item.append(activity);}
   const label=el('label','',m.label);label.style.cssText='display:block;font-weight:650;font-size:15px;margin:5px 0 8px';
   const control=answerControl(m);item.append(label,control);
   const hint=el('p','',m.kind==='duration'?'Unit: '+(m.unit||'minutes'):m.kind==='note'?'Keep the individual's experience in your own words.':'Only recorded answers are counted; blank does not mean No.');
   hint.style.cssText='font-size:12px;color:#666;margin:5px 0';item.append(hint);area.append(item);
   rendered.push({card,measurement:m,control});
  }
  host.append(area);
 }
 const note=el('p','','You may leave questions blank if the activity was not observed. Nothing is automatically recorded as No.');
 note.style.cssText='font-size:13px;color:#666';host.append(note);syncStored();
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
}
document.addEventListener('DOMContentLoaded',()=>{
 window.starIsaCollectEntries=collectEntries;
 init().catch(error=>{
  const host=$('starIsaCheckin');if(!host)return;
  host.hidden=false;host.replaceChildren(el('p','','ISA outcome questions could not load ('+(error?.message||'connection error')+'). Your health check-in remains available. Refresh to retry.'));
 });
});