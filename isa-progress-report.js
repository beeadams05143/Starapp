// STAR UVM TEST ONLY: a read-only, source-labeled ISA evidence report.
// Linkage of an individual's statement is never measured or awarded progress.
import { rest, getSessionFromStorage } from './restClient.js?v=2026.10.28D';
import { ensureActiveGroupId } from './active-group.js?v=2026.10.28D';
import { SUPABASE_URL } from './supabaseClient.js?v=2026.10.28D';

const $=id=>document.getElementById(id);
const create=(tag,content,cls)=>{
 const node=document.createElement(tag); if(content!==undefined)node.textContent=String(content);
 if(cls)node.className=cls; return node;
};
const MAX_CARDS=500,MAX_OBSERVATIONS=500,MAX_CHECKINS=1000;
let groupId=null,userId=null,loading=false;
const dateOk=v=>/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v+'T12:00:00'));
function todayLocal(d=new Date()){
 const year=d.getFullYear(),month=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
 return year+'-'+month+'-'+day;
}
function formatDay(s){
 if(!s)return 'Date not recorded';
 const d=new Date(s.length===10?s+'T12:00:00':s);
 return Number.isFinite(d.getTime())?d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'Date not recorded';
}
function eventDay(value){
 if(!value)return '';
 const d=new Date(value);
 return Number.isFinite(d.getTime())?todayLocal(d):'';
}
function errorMessage(message){
 $('reportStatus').textContent=message;
 $('reportStatus').dataset.error='true';
}
function reportStatus(message){
 $('reportStatus').textContent=message;
 $('reportStatus').dataset.error='false';
}
function dateIncluded(day,from,to){return !!day&&(!from||day>=from)&&(!to||day<=to)}
function summaryItem(parent,label,value){
 const box=create('div',undefined,'metric');
 box.append(create('strong',value),create('span',label));
 parent.append(box);
}
function observationEntry(row){
 const entry=create('div',undefined,'evidence observation');
 entry.append(create('span',formatDay(row.created_at)+' · Individual’s own report','source-label'));
 entry.append(create('blockquote',row.original_words,'person-words'));
 const meta=[];
 if(row.response_choice)meta.push('Selected picture: '+row.response_choice);
 if(row.support_kind&&row.support_kind!=='not_reported')meta.push('Help answering: '+row.support_kind.replace(/_/g,' '));
 if(meta.length)entry.append(create('p',meta.join(' · '),'source-meta'));
 if(row.reviewer_note)entry.append(create('p','Caregiver review note: '+row.reviewer_note,'review-note'));
 entry.append(create('p','Linked to this ISA goal by a reviewer. This is NOT a scored measurement.','disclaimer'));
 return entry;
}
function measureEntry(rec){
 const entry=create('div',undefined,'evidence measure');
 entry.append(create('span',formatDay(rec.date)+' · Caregiver check-in','source-label'));
 const detail=create('p',undefined,'measure-value');
 detail.append(create('strong',rec.measurement_label||'ISA measurement'),document.createTextNode(': '));
 const value=typeof rec.value==='number'?String(rec.value):String(rec.value??'');
 detail.append(document.createTextNode(value+(rec.unit?' '+rec.unit:'')));
 entry.append(detail);
 if(rec.activity)entry.append(create('p','Activity: '+rec.activity,'source-meta'));
 if(rec.caregiver_name)entry.append(create('p','Recorded by: '+rec.caregiver_name,'source-meta'));
 return entry;
}
function render(cards,observations,measures,from,to,truncated){
 const host=$('outcomeReport');
 host.replaceChildren();
 const reviewed=observations.filter(o=>o.review_status==='linked_observation'&&
    o.linked_outcome_id&&dateIncluded(eventDay(o.created_at),from,to));
 const caregiven=measures.filter(x=>dateIncluded(x.date,from,to));
 const counts=$('reportCounts');counts.replaceChildren();
 summaryItem(counts,'ISA Outcome Cards',cards.length);
 summaryItem(counts,'Caregiver measurements',caregiven.length);
 summaryItem(counts,'Reviewed My STAR links',reviewed.length);
 const summary=create('p','Period: '+(from?formatDay(from):'All dates')+' – '+(to?formatDay(to):'Today')+'. Measurements and individual statements are shown separately. No progress percentages or goal attainment are inferred.','report-note');
 host.append(summary);
 if(truncated)host.append(create('p','The report reached a retrieval limit. Narrow the date range to see all entries.','warning'));
 if(!cards.length){
  host.append(create('p','No ISA Outcome Cards are available for this group.','empty'));return;
 }
 for(const card of cards){
  const obs=reviewed.filter(r=>r.linked_outcome_id===card.id);
  const measurements=caregiven.filter(r=>r.outcome_id===card.id);
  const section=create('section',undefined,'outcome-section');
  const heading=create('h2',card.title);section.append(heading);
  section.append(create('p',[card.category,card.status==='archived'?'Archived outcome':null].filter(Boolean).join(' · '),'category'));
  if(card.outcome_text)section.append(create('p',card.outcome_text,'outcome-text'));
  section.append(create('p',measurements.length+' caregiver measurement'+(measurements.length===1?'':'s')+
    ' · '+obs.length+' linked individual observation'+(obs.length===1?'':'s'),'section-count'));
  const linked=create('div',undefined,'evidence-section');
  linked.append(create('h3','⭐ Individual’s own words — reviewed links'));
  if(!obs.length)linked.append(create('p','No approved individual observations linked during this period.','muted'));
  obs.slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))
    .forEach(r=>linked.append(observationEntry(r)));
  section.append(linked);
  const measured=create('div',undefined,'evidence-section');
  measured.append(create('h3','Caregiver-recorded ISA measurements'));
  if(!measurements.length)measured.append(create('p','No ISA measurements submitted in caregiver check-ins during this period.','muted'));
  measurements.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)))
    .forEach(r=>measured.append(measureEntry(r)));
  section.append(measured);host.append(section);
 }
 reportStatus('Report ready. '+reviewed.length+' linked individual observation'+(reviewed.length===1?'':'s')+
  ' and '+caregiven.length+' caregiver measurement'+(caregiven.length===1?'':'s')+' in the selected period.');
}
async function refresh(){
 if(loading)return;
 if(SUPABASE_URL!=='https://rjozzwmkvlndanoaghtc.supabase.co'||
    !['star-uvm-testing.netlify.app','localhost','127.0.0.1'].includes(location.hostname)){
  errorMessage('This report is available only in the separate STAR UVM testing app.');return;
 }
 const from=$('dateFrom').value,to=$('dateTo').value;
 if((from&&!dateOk(from))||(to&&!dateOk(to))||(from&&to&&from>to)){
  errorMessage('Choose a valid date range.');return;
 }
 const session=getSessionFromStorage();
 if(!session?.user?.id){errorMessage('Sign in to STAR TEST before viewing this report.');return;}
 userId=session.user.id;
 loading=true;$('loadReport').disabled=true;
 reportStatus('Loading the ISA cards and related reports…');
 try{
  const currentGroup=await ensureActiveGroupId(userId);
  if(!currentGroup||getSessionFromStorage()?.user?.id!==userId)throw Error('Select your fictional test group.');
  groupId=currentGroup;
  const members=await rest('group_members?select=role&group_id=eq.'+
    encodeURIComponent(groupId)+'&user_id=eq.'+encodeURIComponent(userId)+'&limit=1',{expectedUserId:userId});
  if(members?.[0]?.role!=='admin')throw Error('This STAR TEST report is currently restricted to group administrators.');
  const group=encodeURIComponent(groupId);
  const fromQuery=from?'&date=gte.'+encodeURIComponent(from):'';
  const toQuery=to?'&date=lte.'+encodeURIComponent(to):'';
  const [cards,observations,checkins]=await Promise.all([
    rest('star_isa_outcomes?select=id,group_id,individual_id,title,category,outcome_text,status,measurements,version'+
      '&group_id=eq.'+group+'&individual_id=eq.&order=title.asc&limit='+MAX_CARDS,{expectedUserId:userId}),
    rest('star_individual_observations_test?select=id,group_id,original_words,response_choice,support_kind,review_status,reviewer_note,created_at,linked_outcome_id,linked_outcome_version'+
      '&group_id=eq.'+group+'&review_status=eq.linked_observation&order=created_at.desc&limit='+MAX_OBSERVATIONS,{expectedUserId:userId}),
    rest('caregiver_checkins?select=id,date,caregiver_name,payload&group_id=eq.'+group+fromQuery+toQuery+
      '&order=date.desc&limit='+MAX_CHECKINS,{expectedUserId:userId})
  ]);
  if(!Array.isArray(cards)||!Array.isArray(observations)||!Array.isArray(checkins))
    throw Error('Report sources could not be verified. Try again.');
  if(groupId!==await ensureActiveGroupId(userId)||getSessionFromStorage()?.user?.id!==userId)
    throw Error('Your account or group changed. Refresh the report.');
  const cardIds=new Set(cards.map(c=>c.id));
  const measures=[];
  for(const checkin of checkins){
   let entries=checkin.payload?.isa_entries;
   if(typeof entries==='string'){try{entries=JSON.parse(entries)}catch{entries=null}}
   if(!Array.isArray(entries))continue;
   for(const item of entries){
    if(!item||!cardIds.has(item.outcome_id))continue;
    // Blank is unanswered. Zero is a valid recorded value, not a skipped entry.
    if(item.value===null||item.value===undefined||item.value==='')continue;
    measures.push({...item,date:checkin.date,caregiver_name:checkin.caregiver_name});
   }
  }
  const capped=cards.length===MAX_CARDS||observations.length===MAX_OBSERVATIONS||checkins.length===MAX_CHECKINS;
  render(cards,observations,measures,from,to,capped);
 }catch(error){
  $('outcomeReport').replaceChildren();
  $('reportCounts').replaceChildren();
  errorMessage(error?.message||'Could not load ISA reports.');
 }finally{loading=false;$('loadReport').disabled=false}
}
document.addEventListener('DOMContentLoaded',()=>{
 const today=todayLocal();
 $('dateFrom').value=today.slice(0,8)+'01';
 $('dateTo').value=today;
 $('loadReport').addEventListener('click',refresh);
 $('showAll').addEventListener('click',()=>{$('dateFrom').value='';$('dateTo').value='';refresh()});
 $('printReport').addEventListener('click',()=>window.print());
 refresh();
});