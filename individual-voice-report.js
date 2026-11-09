// UVM STAR TEST: voluntary self-reports are displayed separately from caregiver entries.
// Never turn a self-report, missed answer, preference or pending ISA link into goal achievement.
import {resolveIsaIndividual} from './isa-progress-report-embedded.js';
export const INDIVIDUAL_VOICE_TYPES = Object.freeze({
  mood:'How I Feel', comfort:'Something Hurts', daily_experience:'My Day',
  leisure_preference:'Would You Rather?', accomplishment:'Something I Did'
});
function safeText(value){return String(value??'').trim();}
function localDay(value){
  if(!value)return '';
  const dt=new Date(value);
  if(!Number.isFinite(dt.getTime()))return '';
  return [dt.getFullYear(),String(dt.getMonth()+1).padStart(2,'0'),String(dt.getDate()).padStart(2,'0')].join('-');
}
function scoped(row, groupId, individualId) {
  return String(row?.group_id??'')===groupId &&
    (individualId==null || String(row?.individual_id??'')===individualId);
}
export function buildIndividualVoiceReport(checkins, observations, scope={}, isaCards=[]) {
  const groupId=safeText(scope.groupId),individualId=scope.individualId==null?null:String(scope.individualId);
  if(!groupId)throw Error('An active group is required for Individual Voice.');
  const start=safeText(scope.start),end=safeText(scope.end);
  if(start&&end&&start>end)throw Error('Choose a valid Individual Voice date range.');
  const cardNames=new Map((isaCards||[]).filter(r=>scoped(r,groupId,individualId)).map(r=>[r.id,r.title]));
  const entries=[];
  const seen=new Set();
  for(const r of (Array.isArray(checkins)?checkins:[])) {
    if(!scoped(r,groupId,individualId)||r.is_fictional!==true||!INDIVIDUAL_VOICE_TYPES[r.response_type])continue;
    const date=safeText(r.checkin_date).slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||(start&&date<start)||(end&&date>end))continue;
    if(r.id&&seen.has('checkin:'+r.id))continue;
    if(r.id)seen.add('checkin:'+r.id);
    const choice=safeText(r.response_value);
    if(!choice)continue;
    entries.push({id:r.id,date,type:r.response_type,label:INDIVIDUAL_VOICE_TYPES[r.response_type],
      choice,words:safeText(r.original_words),support:safeText(r.support_kind)||'not_reported',
      offered:Array.isArray(r.offered_options)?r.offered_options.map(safeText).filter(Boolean):[],
      review:'',linkedGoal:'',isFictional:true,source:'checkin'});
  }
  for(const r of (Array.isArray(observations)?observations:[])) {
    if(!scoped(r,groupId,individualId))continue;
    const date=localDay(r.created_at);
    if(!date||(start&&date<start)||(end&&date>end))continue;
    if(r.id&&seen.has('observation:'+r.id))continue;
    if(r.id)seen.add('observation:'+r.id);
    const words=safeText(r.original_words),choice=safeText(r.response_choice);
    if(!words&&!choice)continue;
    entries.push({id:r.id,date,type:'accomplishment',label:INDIVIDUAL_VOICE_TYPES.accomplishment,
      choice,words,support:safeText(r.support_kind)||'not_reported',offered:[],
      review:safeText(r.review_status)||'pending',
      linkedGoal:r.review_status==='linked_observation'?(cardNames.get(r.linked_outcome_id)||'Linked ISA card (historical)'):'',
      isFictional:true,source:'observation'});
  }
  entries.sort((a,b)=>b.date.localeCompare(a.date)||a.label.localeCompare(b.label));
  return {groupId,start,end,entries,checkinCount:entries.filter(e=>e.source==='checkin').length,
    accomplishmentCount:entries.filter(e=>e.source==='observation').length,
    days:new Set(entries.map(e=>e.date)).size,isTest:true};
}
function supportLabel(value){return value==='not_reported'?'Not reported':value}
export function formatIndividualVoiceText(report) {
  const lines=['My STAR — Individual Voice'];
  if(report.start||report.end)lines.push('Reporting period: '+(report.start||'Beginning')+' to '+(report.end||'Present'));
  lines.push('', 'During this period, the individual shared '+report.checkinCount+' optional check-in '+(report.checkinCount===1?'response':'responses')+' and '+report.accomplishmentCount+' '+(report.accomplishmentCount===1?'accomplishment':'accomplishments')+' across '+report.days+' recorded '+(report.days===1?'date':'dates')+'. These are the individual’s own choices and descriptions.');
  const entries=Array.isArray(report.entries)?report.entries:[];
  const groups=new Map();
  for(const e of entries){const label=String(e.label||'Shared experience').trim();if(!groups.has(label))groups.set(label,[]);groups.get(label).push(e)}
  for(const [label,items] of groups){
    lines.push('',label);
    const counts=new Map();
    for(const e of items)if(e.choice){const key=String(e.choice);counts.set(key,(counts.get(key)||0)+1)}
    const selected=[...counts].map(([choice,count])=>count+' '+(count===1?'response':'responses')+' selected “'+choice+'”');
    if(selected.length)lines.push('Recorded selections included '+selected.join('; ')+'.');
    const words=[...new Set(items.map(e=>String(e.words||'').replace(/^FICTIONAL:\s*/i,'').trim()).filter(Boolean))];
    if(words.length)lines.push('In the individual’s own words, recorded examples included '+words.slice(0,3).map(w=>'“'+w+'”').join('; ')+'.'+(words.length>3?' Additional statements remain in the dated records.':''));
    const supports=[...new Set(items.map(e=>e.support).filter(x=>x&&x!=='not_reported').map(supportLabel))];
    if(supports.length)lines.push('Documented help with answering included '+supports.join(' and ')+'.');
    const reviewed=items.filter(e=>e.source==='observation'&&e.review==='linked_observation');
    if(reviewed.length)lines.push(reviewed.length+' '+(reviewed.length===1?'observation was':'observations were')+' linked to an ISA outcome after administrator review.');
    const pending=items.filter(e=>e.source==='observation'&&e.review==='pending');
    if(pending.length)lines.push(pending.length+' '+(pending.length===1?'observation is':'observations are')+' awaiting administrator review.');
  }
  if(!entries.length)lines.push('No optional individual responses were recorded in this period.');
  lines.push('', 'The individual’s participation and answers are voluntary. Missing or declined responses are not treated as negative outcomes, and the person’s statements are not automatically interpreted as caregiver-confirmed observations.');
  return lines.join('\n');
}
export function createIndividualVoiceReport({rest,document:doc=document,clock=()=>new Date()}){
  let activeGroupId=null,loads=null,revision=0,lastText='',requestedIndividual;
  const $=id=>doc.getElementById(id);
  const dateKey=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const d=clock();
  $('individualVoiceStart').value=dateKey(new Date(d.getFullYear(),d.getMonth(),1));
  $('individualVoiceEnd').value=dateKey(d);
  function syncPeriodPresentation(){
    const preset=$('individualVoicePeriod'), dates=$('individualVoiceCustomDates'), summary=$('individualVoicePeriodSummary');
    if(dates)dates.hidden=preset?.value!=='custom';
    if(!summary)return;
    const start=$('individualVoiceStart').value,end=$('individualVoiceEnd').value;
    const pretty=key=>key?new Date(key+'T12:00:00').toLocaleDateString(undefined,
      {month:'short',day:'numeric',year:'numeric'}):'';
    summary.textContent=!start&&!end?'Showing all recorded dates':
      'Showing '+(pretty(start)||'the beginning')+' – '+(pretty(end)||'today');
  }
  syncPeriodPresentation();
  async function readAll(table,group,order,fields){
    const out=[];
    for(let offset=0;offset<10000;offset+=500){
      const rows=await rest(table+'?select='+fields+'&group_id=eq.'+encodeURIComponent(group)+
        '&order='+order+'&limit=500&offset='+offset);
      if(!Array.isArray(rows))throw Error('Unable to read all individual records.');
      out.push(...rows);
      if(rows.length<500)return out;
    }
    throw Error('Too many individual records to safely display.');
  }
  async function refresh(groupId,individualId){
    requestedIndividual=individualId;
    const group=String(groupId||''),current=++revision;
    activeGroupId=group;loads=null;
    if(!group){$('individualVoiceStatus').textContent='Select your STAR Test group.';$('individualVoiceList').replaceChildren();return}
    $('individualVoiceStatus').textContent='Loading My STAR fictional responses…';
    loads=Promise.all([
      readAll('star_individual_checkins_test',group,'checkin_date.desc,created_at.desc','*'),
      readAll('star_individual_observations_test',group,'created_at.desc','*'),
      readAll('star_isa_outcomes',group,'created_at.asc','id,group_id,individual_id,title')
    ]);
    try { await loads; if(current===revision)await redraw() }
    catch(err){if(current===revision){
      $('individualVoiceStatus').textContent='Individual Voice unavailable: '+(err.message||'Check STAR TEST permissions.');
      $('individualVoiceList').replaceChildren();$('individualVoiceCopy').disabled=true;
    }}
  }
  async function build(scope={}){
    if(!loads||!activeGroupId)throw Error('Individual Voice data has not loaded.');
    const [checkins,observations,cards]=await loads;
    if(scope.groupId && scope.groupId!==activeGroupId)throw Error('Active group changed. Reload Reports.');
    return buildIndividualVoiceReport(checkins,observations,{
      groupId:activeGroupId,
      start:scope.start??$('individualVoiceStart').value,
      end:scope.end??$('individualVoiceEnd').value,
      individualId:resolveIsaIndividual([...checkins,...observations],cards,scope.individualId??requestedIndividual)
    },cards);
  }
  async function redraw(){
    const version=revision;
    try {
      const report=await build();
      if(version!==revision)return;
      lastText=formatIndividualVoiceText(report);
      const list=$('individualVoiceList');list.replaceChildren();
      $('individualVoiceStatus').textContent=report.checkinCount+' check-in answer(s), '+
        report.accomplishmentCount+' shared accomplishment(s) · fictional test data.';
      for(const item of report.entries){
        const article=doc.createElement('div');
        article.style.cssText='background:#fffdf8;border:1px solid #e0d9ce;border-radius:12px;padding:14px;margin:10px 0';
        const heading=doc.createElement('strong');
        heading.textContent=item.date+' · '+item.label;article.append(heading);
        const details=[];
        if(item.offered.length)details.push('Offered: '+item.offered.join(' or '));
        if(item.choice)details.push('Selected: '+item.choice);
        if(item.words)details.push('Original words: “'+item.words+'”');
        details.push('Help: '+supportLabel(item.support));
        if(item.source==='observation'){
          details.push(item.review==='linked_observation'?'ISA link reviewed by administrator: '+item.linkedGoal:
            item.review==='pending'?'ISA link: Awaiting administrator review':'ISA link: '+(item.review==='needs_details'?'Further review needed':'Not credited'));
        }
        for(const line of details){
          const p=doc.createElement('p');
          p.style.cssText='margin:6px 0;line-height:1.45;font-size:14px';
          p.textContent=line;article.append(p);
        }
        list.append(article);
      }
      if(!report.entries.length)list.textContent='No check-ins recorded for these dates. Participation is optional.';
      $('individualVoiceCopy').disabled=false;
    }catch(err){if(version!==revision)return;
      $('individualVoiceStatus').textContent='Individual Voice unavailable: '+err.message;
      $('individualVoiceList').replaceChildren();$('individualVoiceCopy').disabled=true;
    }
  }
  $('individualVoicePeriod')?.addEventListener('change',()=>{
    const period=$('individualVoicePeriod').value,now=clock();
    if(period==='month'){$('individualVoiceStart').value=dateKey(new Date(now.getFullYear(),now.getMonth(),1));$('individualVoiceEnd').value=dateKey(now)}
    if(period==='all'){$('individualVoiceStart').value='';$('individualVoiceEnd').value=''}
    syncPeriodPresentation();
    redraw();
  });
  for(const el of [$('individualVoiceStart'),$('individualVoiceEnd')])el?.addEventListener('change',()=>{
    $('individualVoicePeriod').value='custom';syncPeriodPresentation();redraw();
  });
  $('individualVoiceCopy')?.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(lastText);$('individualVoiceStatus').textContent='Individual Voice text copied.'}
    catch{$('individualVoiceStatus').textContent='Copy unavailable on this device.'}
  });
  return {refresh,redraw,letter:async(scope)=>formatIndividualVoiceText(await build(scope))};
}
