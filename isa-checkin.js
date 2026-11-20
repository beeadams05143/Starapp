// ISA measurement questions are generated from administrator-owned outcome cards.
// Render follow-ups beside the caregiver's regular check-in questions.
import { rest, getSessionFromStorage } from './restClient.js?v=2026.10.29UVM3';
import { ensureActiveGroupId } from './active-group.js?v=2026.10.29UVM3';

const $ = id => document.getElementById(id);
const el = (tag,cls,text) => {const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
let loaded=false, cards=[], rendered=[], linked=[], selectedAssignment=null;
function availableSourceFields(sourceField){
  return [...document.querySelectorAll('[name]')].filter(x=>x.name===sourceField&&x.type!=='hidden'&&
    !x.disabled && !x.closest('.config-hidden') && !x.closest('[hidden]') &&
    !x.closest('[aria-hidden="true"]'));
}
function recordedValue(sourceField,measurement){
  const visible=availableSourceFields(sourceField);
  if(!visible.length)return null;
  const checked=visible.find(x=>(x.type==='radio'||x.type==='checkbox')&&x.checked);
  const field=checked||visible.find(x=>x.type!=='radio'&&x.type!=='checkbox');
  if(!field)return null;
  const raw=String(field.value??'').trim();
  if(!raw)return null;
  if(measurement.kind==='count'||measurement.kind==='duration'){
    if(!/^\d+(?:\.\d+)?$/.test(raw))return null;
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
 for(const row of rendered){
  const {card,measurement,control,notes,objective} = row;
  const value = control.value;
  const note = notes.value.trim();
  if (!value && !note) {
   if (row.previousEntry) items.push(row.previousEntry);
   continue;
  }
  items.push({
   outcome_id:card.id,outcome_title:card.title,outcome_version:card.version,
   outcome_category:card.category,measurement_id:measurement.id,
   measurement_label:objective,activity:measurement.activity||'',
   answer_type:'boolean',response_format:'objective_occurrence',
   frequency:measurement.frequency||'when_occurs',report_mode:measurement.report_mode||'summary',
   individual_id:selectedAssignment?.individual_id||null,
   assignment_id:selectedAssignment?.id||null,
   source_type:'isa_question',
   value,notes:note
  });
 }
 for(const {card,measurement,sourceField,linkId} of linked){
   if(!availableSourceFields(sourceField).length)continue;
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
     source_field:sourceField,source_type:'admin_approved_checkin_reuse',isa_link_id:linkId,
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
 for (const row of rendered) {
  const {card,measurement,control,notes} = row;
  const found = entries.find(entry => entry.outcome_id === card.id && entry.measurement_id === measurement.id);
  const value = String(found?.value ?? '').toLowerCase();
  const occurrence = found?.response_format === 'objective_occurrence';
  const yesNo = (occurrence || found?.answer_type === 'boolean') && ['yes','no','true','false'].includes(value);
  control.value = yesNo ? (['yes','true'].includes(value) ? 'Yes' : 'No') : '';
  notes.value = occurrence ? (found.notes || '') : '';
  row.previousEntry = found && !occurrence && !yesNo && found.source_type !== 'admin_approved_checkin_reuse' ? found : null;
 }
 syncStored();
}
function syncStored(){
 const field=$('isa_entries');
 if(field)field.value=JSON.stringify(collectEntries());
}
const sectionIds = new Set(['homeFamilySection', 'communitySection', 'daily-living-step', 'vocationalSection',
 'physicalSection', 'behaviorSection', 'educational-step', 'final-notes-step']);
function sectionFor(placement) {
 const id = placement?.section;
 const step = sectionIds.has(id) && $(id);
 return step && !step.hidden && !step.classList.contains('config-hidden') ? id : null;
}
function panelFor(id) {
 const content = $(id)?.querySelector('.section-content');
 return content?.querySelector('fieldset.panel') || content;
}
function insertFollowUp(node, panel) {
 const controls = panel.querySelector(':scope > .controls');
 if (controls) controls.before(node);
 else panel.append(node);
}
function render(){
 rendered=[];
 const placements = selectedAssignment?.selected_items?.__isa_placement__;
 const groups = new Map();
 for (const card of cards) for (const m of (Array.isArray(card.measurements) ? card.measurements : [])) {
  if (!m?.id || !m.label) continue;
  // An approved source is the only question, including shifts where its field is skipped.
  if (linked.some(link => link.card.id === card.id && link.measurement.id === m.id)) continue;
  const placement = placements?.[card.id + ':' + m.id];
  if (selectedAssignment) {
   // An untouched legacy placement is indistinguishable from the old default.
   const included = placement?.included ?? Boolean(
    (placement?.section && placement.section !== 'final-notes-step') ||
    placement?.prompt || placement?.after || placement?.steps?.length);
   if (!included) continue;
  }
  const section = sectionFor(placement) || (!selectedAssignment ? 'final-notes-step' : null);
  if (!section) continue;
  const panel = panelFor(section);
  if (!panel) continue;
  const afterHome = section === 'homeFamilySection' && placement?.after === 'homeActivities';
  const key = section + ':' + afterHome;
  if (!groups.has(key)) {
   const host = el('div','isa-inline-questions');
   host.style.cssText = 'margin:16px 0;display:grid;gap:12px';
   const anchor = afterHome && $('homeNotesWrap');
   if (anchor && panel.contains(anchor)) anchor.after(host);
   else insertFollowUp(host,panel);
   groups.set(key,host);
  }
  const item = el('div');
  item.style.cssText = 'padding:12px;border:1px solid #dfd8c9;border-radius:12px;background:#fffdf8';
  const objective = placement?.prompt?.trim() || m.activity?.trim() ||
   (card.measurements.length === 1 ? card.title : m.label);
  const control = el('select');
  control.add(new Option('Select Yes or No',''));
  control.add(new Option('Yes','Yes'));
  control.add(new Option('No','No'));
  control.setAttribute('aria-label', objective + ' — Did this happen?');
  const answer = el('label','',objective);
  answer.append(control);
  const notes = el('textarea');
  notes.rows = 2;
  notes.placeholder = 'Add any details to share with the case manager';
  notes.setAttribute('aria-label', 'Notes for ' + objective);
  const notesLabel = el('label','', 'Notes (optional)');
  notesLabel.style.marginTop = '8px';
  notesLabel.append(notes);
  const row = {card,measurement:m,control,notes,objective,section,previousEntry:null};
  const save = () => {
   row.previousEntry = null;
   syncStored();
  };
  control.addEventListener('change',save);
  notes.addEventListener('input',save);
  item.append(answer,notesLabel);
  groups.get(key).append(item);
  rendered.push(row);
 }
 restoreEntries();
}
async function init(context, generation){
 if (context.isParent) return;
 const session=getSessionFromStorage();if(!session?.user?.id)return;
 const group=await ensureActiveGroupId(session.user.id);if(!group || group !== context.groupId)return;
 const preview = new URLSearchParams(window.location.search).has('previewAssignment');
 if (preview && (!context.assignmentId || context.groupId !== group || !context.caregiverUserId)) return;
 const caregiverUserId = preview ? context.caregiverUserId : session.user.id;
 const assignmentRows=await rest('star_caregiver_checkin_assignments?select=*&active=eq.true&group_id=eq.'+
   encodeURIComponent(group)+'&caregiver_user_id=eq.'+encodeURIComponent(caregiverUserId)+'&order=created_at.asc');
 const assignment=(assignmentRows||[]).find(x=>x.id===context.assignmentId)||null;
 const individualId=assignment?.individual_id||'';
 // Preserve historical group-level cards only for groups without per-person assignment.
 const rows=await rest('star_isa_outcomes?select=*&group_id=eq.'+encodeURIComponent(group)+
   '&status=eq.active&order=created_at.asc&limit=300');
 if(rows?.length>=300)throw new Error('Too many ISA outcomes to display safely.');
 let legacyAllowed=false;
 if(individualId){
   const memberIds=(await rest('group_members?select=user_id&group_id=eq.'+encodeURIComponent(group))).map(r=>r.user_id);
   const people=memberIds.length?await rest('profiles?select=id,role&id=in.('+memberIds.map(encodeURIComponent).join(',')+')'):[];
   const individuals=people.filter(p=>p.role==='individual');
   legacyAllowed=individuals.length===1&&individuals[0].id===individualId;
 }
 const matchingCards=(rows||[]).filter(card=>{
   // Legacy outcome cards use an empty individual_id; only associate with the sole
   // registered individual of that group. Do not alter historical card ownership.
   if(card.individual_id!==individualId && !(card.individual_id==='' && legacyAllowed))return false;
   const assignees=Array.isArray(card.assigned_user_ids)?card.assigned_user_ids:[];
   return !assignees.length||assignees.includes(caregiverUserId);
 });
 const allLinks=assignment?
  await rest('star_isa_measure_links?select=*&assignment_id=eq.'+encodeURIComponent(assignment.id)):[];
 if (generation !== loadGeneration) return;
 selectedAssignment=assignment;
 cards=matchingCards;
 const approved=allLinks||[];
 linked=[];
 for(const card of cards)for(const measurement of (Array.isArray(card.measurements)?card.measurements:[])){
   const link=approved.find(l=>l.outcome_id===card.id&&l.measurement_id===measurement.id);
   const placement = assignment?.selected_items?.__isa_placement__?.[card.id + ':' + measurement.id];
   if(link && placement?.included !== false)linked.push({card,measurement,sourceField:link.source_field,linkId:link.id});
 }
 loaded=true;render();
}

let loadGeneration = 0;
document.addEventListener('DOMContentLoaded',()=>{
 window.starIsaCollectEntries=collectEntries;
 window.starIsaRestoreEntries=restoreEntries;
 window.starIsaReviewSection=entry=>rendered.find(row=>row.card.id===entry.outcome_id &&
  row.measurement.id===entry.measurement_id)?.section || 'final-notes-step';
 const reload=()=>{
  const context=window.starCheckinAssignmentContext;
  if (!context) return;
  const generation=++loadGeneration;
  loaded=false;
  rendered=[];
  document.querySelectorAll('.isa-inline-questions').forEach(node=>node.remove());
  window.starIsaLoad = init(context,generation).catch(()=>{
   if (generation !== loadGeneration) return;
   const message=el('p','isa-inline-questions','Assigned follow-up questions could not load. Refresh this page to try again.');
   const panel=panelFor('final-notes-step');
   if (panel) insertFollowUp(message,panel);
  });
 };
 window.addEventListener('star-caregiver-assignment-ready',reload);
 if (window.starCheckinAssignmentContext) reload();
});
