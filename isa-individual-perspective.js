// UVM TEST ONLY: a person-centered companion to caregiver ISA measurements.
// Reviewed goal links establish relevance, not skill completion. Other individual
// activity preferences remain unlinked and must not be counted as ISA progress.
const sourceDate=(value)=>{
  if(!value)return '';
  const d=new Date(value);
  if(!Number.isFinite(d.getTime()))return '';
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
};
export function buildIsaIndividualPerspective(observations,checkins,cards,scope={}){
  const group=String(scope.groupId||''),person=scope.individualId==null?null:String(scope.individualId);
  const start=String(scope.start||''),end=String(scope.end||'');
  if(!group)throw Error('Select your STAR TEST group.');
  if(start&&end&&start>end)throw Error('Choose a valid date range.');
  const valid=row=>row&&String(row.group_id||'')===group&&
    (person===null||String(row.individual_id||'')===person);
  const inRange=date=>date&&(!start||date>=start)&&(!end||date<=end);
  const goals=new Map((Array.isArray(cards)?cards:[]).filter(valid).map(x=>[String(x.id),String(x.title||'Untitled ISA outcome')]));
  const reviewed=[],feedback=[],reviewSeen=new Set(),feedbackSeen=new Set();
  for(const row of Array.isArray(observations)?observations:[]){
    if(!valid(row)||row.review_status!=='linked_observation')continue;
    const id=String(row.linked_outcome_id||'');
    if(!goals.has(id)||row.id&&reviewSeen.has(row.id))continue;
    const date=sourceDate(row.created_at);
    if(!inRange(date))continue;
    const words=String(row.original_words||'').trim(),choice=String(row.response_choice||'').trim();
    if(!words&&!choice)continue;
    if(row.id)reviewSeen.add(row.id);
    reviewed.push({date,goalId:id,goalTitle:goals.get(id),words,choice,
      support:String(row.support_kind||'not_reported'),source:'Individual’s Something I Did',
      review:'Administrator-reviewed ISA connection (not scored progress)'});
  }
  for(const row of Array.isArray(checkins)?checkins:[]){
    if(!valid(row)||row.is_fictional!==true||
      !['daily_experience','leisure_preference'].includes(row.response_type))continue;
    if(row.id&&feedbackSeen.has(row.id))continue;
    const date=String(row.checkin_date||'').slice(0,10);
    if(!inRange(date))continue;
    const value=String(row.response_value||'').trim(),words=String(row.original_words||'').trim();
    if(!value&&!words)continue;
    if(row.id)feedbackSeen.add(row.id);
    feedback.push({date,type:row.response_type,value,words,
      offered:Array.isArray(row.offered_options)?row.offered_options.map(x=>String(x)):[],
      support:String(row.support_kind||'not_reported'),source:'Individual’s own check-in'});
  }
  reviewed.sort((a,b)=>b.date.localeCompare(a.date)||a.goalTitle.localeCompare(b.goalTitle));
  feedback.sort((a,b)=>b.date.localeCompare(a.date));
  return {groupId:group,start,end,reviewed,feedback};
}
export function formatIsaIndividualPerspectiveText(data){
  const lines=[];
  if(data.reviewed.length){
    lines.push('Individual’s Voice — Reviewed ISA Connections',
      'An administrator reviewed the link between each statement and its ISA outcome. This is not a scored measurement or confirmation that every skill step was completed.');
    const groups=new Map();
    for(const row of data.reviewed){
      if(!groups.has(row.goalId))groups.set(row.goalId,{title:row.goalTitle,rows:[]});
      groups.get(row.goalId).rows.push(row);
    }
    for(const group of groups.values()){
      lines.push('',group.title);
      for(const r of group.rows.slice(0,3))
        lines.push(r.date+' · '+(r.words?'Individual’s words: “'+r.words+'”':'Picture selection: '+r.choice)+
          (r.support!=='not_reported'?' · Help with answering: '+r.support:''));
      if(group.rows.length>3)lines.push(group.rows.length-3+' more reviewed statements available in Reports.');
    }
  }
  if(data.feedback.length){
    lines.push('','Individual’s Activity Experiences & Preferences',
      'The person’s expressed satisfaction and preferences can guide future activity choices. These self-reports are not automatically assigned to an ISA goal.');
    const relevant=[...data.feedback].sort((a,b)=>{
      const disliked=x=>/did not like|neither|not today/i.test(x.value)?1:0;
      return disliked(b)-disliked(a)||b.date.localeCompare(a.date);
    });
    for(const r of relevant.slice(0,5)){
      lines.push(r.date+' · '+(r.type==='daily_experience'?'Activity feedback':'Leisure choice')+
        ': '+r.value+(r.words?' · Person’s description: “'+r.words+'”':'')+
        (r.offered.length?' · Choices offered: '+r.offered.join(' / '):'')+
        (r.type==='daily_experience'&&!r.words?' · Activity not specified':''));
    }
    if(data.feedback.length>5)lines.push((data.feedback.length-5)+' additional feedback responses available in Reports.');
  }
  return lines.join('\n');
}
export function createIsaIndividualPerspective({rest,document:doc=document}){
  const $=id=>doc.getElementById(id);
  let groupId='',recordsPromise=null,revision=0;
  const readAll=async(table,query,group)=>{
    const all=[];
    for(let offset=0;offset<5000;offset+=500){
      const rows=await rest(table+'?'+query+'&group_id=eq.'+encodeURIComponent(group)+
        '&limit=500&offset='+offset);
      if(!Array.isArray(rows))throw Error('Individual ISA evidence could not be verified.');
      all.push(...rows);
      if(rows.length<500)return all;
    }
    throw Error('Too many individual ISA responses to show completely. Narrow the date range.');
  };
  const dateScope=()=>({start:$('isaProgressStart')?.value||'',end:$('isaProgressEnd')?.value||''});
  async function getReport(scope={}){
    if(!groupId||!recordsPromise)throw Error('ISA Individual Voice not loaded.');
    if(scope.groupId&&String(scope.groupId)!==groupId)throw Error('STAR TEST group changed.');
    const [observations,checkins,cards]=await recordsPromise;
    return buildIsaIndividualPerspective(observations,checkins,cards,{
      ...dateScope(),...scope,groupId,individualId:scope.individualId??''
    });
  }
  async function redraw(){
    const request=revision,host=$('isaIndividualPerspective');
    if(!host)return;
    try{
      const data=await getReport();
      if(request!==revision)return;
      host.replaceChildren();
      const title=doc.createElement('h3');
      title.textContent='🗣️ Individual Voice in ISA Planning';
      host.append(title);
      const intro=doc.createElement('p');intro.className='muted';
      intro.textContent='Administrator-reviewed “I Did It” links and the individual’s own opinions. Neither creates automatic ISA scores.';
      host.append(intro);
      if(!data.reviewed.length&&!data.feedback.length){
        const empty=doc.createElement('p');empty.textContent='No reviewed individual statements or activity feedback for this date range.';
        host.append(empty);
        return;
      }
      if(data.reviewed.length){
        const h=doc.createElement('h4');h.textContent='⭐ Reviewed “I Did It” statements';host.append(h);
        for(const r of data.reviewed){
          const item=doc.createElement('div');item.className='isa-voice-item';
          const heading=doc.createElement('strong');heading.textContent=r.goalTitle+' · '+r.date;item.append(heading);
          const quote=doc.createElement('p');
          quote.textContent=r.words?'“'+r.words+'”':'Selected picture: '+r.choice;
          item.append(quote);
          const desc=doc.createElement('p');desc.className='muted';
          desc.textContent='Administrator-reviewed ISA connection (not a scored measurement)'+
            (r.support!=='not_reported'?' · Answer support: '+r.support:'');
          item.append(desc);host.append(item);
        }
      }
      if(data.feedback.length){
        const h=doc.createElement('h4');h.textContent='Activity feedback & preferences';host.append(h);
        const p=doc.createElement('p');p.className='muted';
        p.textContent='Liked, disliked and preferred activities inform what to try again or change. Feedback is not assigned to a goal without review.';
        host.append(p);
        for(const r of data.feedback){
          const item=doc.createElement('div');item.className='isa-voice-item';
          const header=doc.createElement('strong');
          header.textContent=r.date+' · '+(r.type==='daily_experience'?'How the activity felt':'Leisure choice');
          item.append(header);
          const note=doc.createElement('p');
          note.textContent='Selected: '+r.value+(r.words?' · “'+r.words+'”':'')+
            (r.offered.length?' · Offered: '+r.offered.join(' or '):'')+
            (r.type==='daily_experience'&&!r.words?' · Activity not specified':'');
          item.append(note);host.append(item);
        }
      }
    }catch(err){
      if(request!==revision)return;
      host.replaceChildren();
      const p=doc.createElement('p');p.textContent='Individual ISA evidence unavailable: '+err.message;host.append(p);
    }
  }
  async function refresh(group){
    groupId=String(group||'');revision++;
    const host=$('isaIndividualPerspective');
    if(host)host.textContent='Loading individual ISA evidence…';
    if(!groupId){recordsPromise=null;return}
    recordsPromise=Promise.all([
      readAll('star_individual_observations_test',
        'select=id,group_id,individual_id,created_at,original_words,response_choice,support_kind,review_status,linked_outcome_id&review_status=eq.linked_observation&order=created_at.desc',groupId),
      readAll('star_individual_checkins_test',
        'select=id,group_id,individual_id,checkin_date,response_type,response_value,original_words,offered_options,support_kind,is_fictional&response_type=in.(daily_experience,leisure_preference)&order=checkin_date.desc',groupId),
      readAll('star_isa_outcomes',
        'select=id,group_id,individual_id,title&order=created_at.asc',groupId)
    ]);
    await redraw();
  }
  for(const id of ['isaProgressPeriod','isaProgressStart','isaProgressEnd']){
    $(id)?.addEventListener('change',()=>{revision++;void redraw()});
  }
  return {refresh,redraw,letter:async(scope)=>formatIsaIndividualPerspectiveText(await getReport(scope))};
}
