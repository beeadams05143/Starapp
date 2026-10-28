import { rest, getSessionFromStorage } from './restClient.js?v=2025.01.09E';
import { ensureActiveGroupId } from './active-group.js';

const queue=document.getElementById('queue');
const status=document.getElementById('queueStatus');
const flash=document.getElementById('reviewFeedback');
let groupId=null,isAdmin=false,cards=[],records=[],focusId=null,busy=false;

function el(tag,words='',className=''){
  const node=document.createElement(tag);
  node.textContent=String(words??'');
  if(className)node.className=className;
  return node;
}
function feedback(words='',bad=false){
  if(!flash)return;
  flash.hidden=!words;
  flash.textContent=words;
  flash.dataset.error=String(bad);
}
function stateLabel(s){
  return ({
    pending:'Waiting for review',
    linked_observation:'Linked to ISA goal',
    needs_details:'Needs more information',
    unlinked:'Not related to an ISA goal'
  })[s]||'Review pending';
}
function selectedOutcomeLabel(card){
  return card ? [card.category,card.title].filter(Boolean).join(' — ') : '';
}
function supportLabel(kind){
  if(!kind||kind==='not_reported')return 'Not reported';
  return String(kind).replace(/_/g,' ');
}
function fieldLabel(value){
  return String(value||'').trim();
}
function makeButton(label,kind,handler){
  const button=el('button',label,kind);
  button.type='button';
  button.disabled=busy;
  button.addEventListener('click',handler);
  return button;
}
function recommendations(row){
  if(!window.StarIsaMatcher)return [];
  return window.StarIsaMatcher.evaluate(row,cards);
}
function outcomePreview(card,host){
  host.replaceChildren();
  if(!card){host.hidden=true;return}
  host.hidden=false;
  host.append(el('div','Selected ISA Outcome Card','card-caption'));
  host.append(el('strong',card.title,'outcome-title'));
  if(card.outcome_text)host.append(el('p',card.outcome_text,'outcome-words'));
  const measurements=Array.isArray(card.measurements)?card.measurements:[];
  if(measurements.length){
    const names=measurements.map(m=>[m.label,m.unit&&'('+m.unit+')'].filter(Boolean).join(' ')).filter(Boolean);
    if(names.length)host.append(el('p','Tracked separately: '+names.join(' · '),'muted'));
  }
}
async function saveDecision(row,decision,outcomeId,note){
  if(busy||!isAdmin)throw Error('Only an authorized STAR TEST administrator can review this observation.');
  const session=getSessionFromStorage();
  if(!session?.user?.id||!groupId)throw Error('Please sign in to your STAR TEST account.');
  if(await ensureActiveGroupId(session.user.id)!==groupId||getSessionFromStorage()?.user?.id!==session.user.id)
    throw Error('Your test group or account changed. Refresh this page.');
  const card=decision==='linked_observation'?cards.find(c=>c.id===outcomeId):null;
  if(decision==='linked_observation'&&!card)throw Error('Select an active ISA goal card first.');
  const values={
    review_status:decision,
    linked_outcome_id:card?.id||null,
    linked_outcome_version:card?.version||null,
    reviewer_note:String(note||'').trim().slice(0,600)
  };
  const result=await rest(
    'star_individual_observations_test?id=eq.'+encodeURIComponent(row.id)+
    '&group_id=eq.'+encodeURIComponent(groupId),{
      method:'PATCH',
      expectedUserId:session.user.id,
      headers:{Prefer:'return=representation'},
      body:JSON.stringify(values)
    });
  if(!Array.isArray(result)||result.length!==1||result[0]?.id!==row.id||
     result[0]?.review_status!==decision||result[0]?.linked_outcome_id!==(card?.id||null))
    throw Error('The review could not be verified. Nothing has been marked complete.');
}
async function act(row,decision,cardId,note){
  if(busy)return;
  busy=true;
  feedback('Saving your decision…');
  render();
  try{
    await saveDecisionAllowBusy(row,decision,cardId,note);
    focusId=null;
    await load();
    const title=decision==='linked_observation'
      ? cards.find(c=>c.id===cardId)?.title
      : null;
    feedback(
      decision==='linked_observation'
        ? '✓ Linked to '+(title||'the selected ISA goal')+'. The person’s words are preserved; no measured progress was awarded.'
        : decision==='unlinked'
          ? '✓ Saved as a personal observation, without an ISA goal link.'
          : '✓ Saved for follow-up. The person’s own words are preserved.'
    );
  }catch(error){
    feedback(error?.message||'Could not save the review.',true);
  }finally{
    busy=false;
    render();
  }
}
// Keep the busy guard while using a single awaited database call.
async function saveDecisionAllowBusy(row,decision,cardId,note){
  const wasBusy=busy;
  busy=false;
  try{await saveDecision(row,decision,cardId,note)}
  finally{busy=wasBusy}
}
function renderCurrent(row,pending){
  const panel=el('section','','panel active-review');
  panel.append(el('div',new Date(row.created_at).toLocaleString()+' · '+stateLabel(row.review_status),'review-meta'));
  panel.append(el('div','What the person said','prompt-label'));
  panel.append(el('blockquote',row.original_words,'words'));
  const details=[row.response_choice&&'They selected: '+row.response_choice,
    'Help with answering: '+supportLabel(row.support_kind)].filter(Boolean);
  panel.append(el('p',details.join(' · '),'muted'));

  const heading=el('h2','Does this relate to an ISA goal?','review-question');
  panel.append(heading);
  const pickLabel=el('label','Choose an ISA Outcome Card');
  const pick=el('select');
  const pickerId='reviewOutcomePicker';
  pick.id=pickerId;
  pickLabel.htmlFor=pickerId;
  const empty=el('option','Select a goal, if it fits…');empty.value='';
  pick.append(empty);
  const suggested=recommendations(row);
  const suggestedIds=new Set(suggested.map(s=>s.outcome_id));
  const ordered=[...cards.filter(c=>suggestedIds.has(c.id)),...cards.filter(c=>!suggestedIds.has(c.id))];
  for(const card of ordered){
    const option=el('option',(suggestedIds.has(card.id)?'★ Possible match · ':'')+selectedOutcomeLabel(card));
    option.value=card.id;
    pick.append(option);
  }
  const currentlyLinked=row.review_status==='linked_observation'&&cards.some(c=>c.id===row.linked_outcome_id)
    ?row.linked_outcome_id:'';
  pick.value=currentlyLinked;
  const hint=el('p',
    suggested.length
      ? 'STAR highlighted a possible match. You decide whether the actual ISA goal fits.'
      : 'Choose from all active ISA Outcome Cards. No match is required.',
    'picker-hint');
  const cardInfo=el('div','','selected-outcome');
  outcomePreview(cards.find(c=>c.id===pick.value),cardInfo);
  pick.addEventListener('change',()=>{
    outcomePreview(cards.find(c=>c.id===pick.value),cardInfo);
    yes.disabled=busy||!pick.value;
  });
  panel.append(pickLabel,pick,hint,cardInfo);
  const noteLabel=el('label','Caregiver note (optional)');
  noteLabel.htmlFor='reviewNote';
  const note=el('textarea');
  note.id='reviewNote';
  note.rows=2;
  note.maxLength=600;
  note.value=row.reviewer_note||'';
  note.placeholder='Anything helpful to explain this connection?';
  panel.append(noteLabel,note);
  panel.append(el('p','This links their words to a goal. It does not record steps, duration, or award ISA progress.','safety-note'));
  const controls=el('div','','decision-actions');
  const yes=makeButton('✓ Yes, link to this goal','primary',()=>{
    if(!pick.value){feedback('Select an ISA Outcome Card first.',true);pick.focus();return}
    act(row,'linked_observation',pick.value,note.value);
  });
  yes.disabled=busy||!pick.value;
  controls.append(yes);
  const secondary=el('div','','secondary-actions');
  secondary.append(
    makeButton('No — no goal link','alt',()=>act(row,'unlinked',null,note.value)),
    makeButton('Need more information','text-action',()=>act(row,'needs_details',null,note.value))
  );
  controls.append(secondary);panel.append(controls);
  if(!isAdmin){
    controls.hidden=true;pick.disabled=true;note.readOnly=true;
    panel.append(el('p','An administrator will review this observation.','muted'));
  }
  return panel;
}
function renderHistory(history){
  if(!history.length)return;
  const details=el('details','','history');
  details.append(el('summary','Previously reviewed ('+history.length+')'));
  const list=el('div','','history-list');
  history.forEach(row=>{
    const item=el('div','','history-item');
    item.append(el('strong',row.original_words,'history-words'));
    const linked=cards.find(c=>c.id===row.linked_outcome_id);
    item.append(el('p',stateLabel(row.review_status)+(linked?' · '+linked.title:''),'muted'));
    if(isAdmin)item.append(makeButton('Review / change','alt',()=>{focusId=row.id;feedback();render();window.scrollTo({top:0,behavior:'smooth'})}));
    list.append(item);
  });
  details.append(list);queue.append(details);
}
function render(){
  queue.replaceChildren();
  if(!groupId){status.textContent='Checking STAR TEST permissions…';return}
  const pending=records.filter(r=>r.review_status==='pending');
  const history=records.filter(r=>r.review_status!=='pending');
  const current=records.find(r=>r.id===focusId)||pending[0]||null;
  status.textContent=pending.length
    ? pending.length+' observation'+(pending.length===1?'':'s')+' to review'
    : 'All caught up — no observations waiting for review.';
  const intro=document.getElementById('reviewIntro');
  if(intro)intro.textContent='Read the person’s words, then decide whether an ISA Outcome Card fits.';
  if(current){
    if(focusId){
      const goBack=makeButton('← Back to pending observations','alt',()=>{focusId=null;feedback();render()});
      queue.append(goBack);
    }
    queue.append(renderCurrent(current,pending));
  }else{
    queue.append(el('p','⭐ You’re all caught up. New My STAR observations will appear here.','empty'));
  }
  renderHistory(history);
}
async function load(){
  const [outcomes,rows]=await Promise.all([
    rest('star_isa_outcomes?select=id,group_id,individual_id,title,category,outcome_text,measurements,status,version&group_id=eq.'+
      encodeURIComponent(groupId)+'&individual_id=eq.&status=eq.active&order=title.asc&limit=100'),
    rest('star_individual_observations_test?select=*&group_id=eq.'+
      encodeURIComponent(groupId)+'&order=created_at.desc&limit=100')
  ]);
  if(!Array.isArray(outcomes)||!Array.isArray(rows))throw Error('Could not read the ISA goals and observations.');
  cards=outcomes;
  records=rows;
}
(async()=>{
  try{
    const session=getSessionFromStorage();
    if(!session?.user?.id)throw Error('Sign in to STAR TEST first.');
    groupId=await ensureActiveGroupId(session.user.id);
    if(!groupId)throw Error('Select your fictional test group first.');
    const members=await rest('group_members?select=role&group_id=eq.'+encodeURIComponent(groupId)+
      '&user_id=eq.'+encodeURIComponent(session.user.id)+'&limit=1');
    isAdmin=members?.[0]?.role==='admin';
    await load();
    render();
  }catch(error){
    status.textContent=error?.message||'Unable to open this review page.';
    feedback('The observation queue could not be loaded.',true);
  }
})();
