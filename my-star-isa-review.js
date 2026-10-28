import { rest, getSessionFromStorage } from './restClient.js?v=2025.01.09E';
import { ensureActiveGroupId } from './active-group.js';
const queue=document.getElementById('queue');
const status=document.getElementById('queueStatus');
let groupId=null,isAdmin=false,cards=[],records=[];
function text(tag,value,cls=''){const e=document.createElement(tag);e.textContent=String(value||'');if(cls)e.className=cls;return e}
function message(v,bad=false){status.textContent=v;status.style.color=bad?'#962923':'#345e48'}
function stateLabel(s){return ({pending:'Pending review',linked_observation:'Linked as an observation (NOT progress)',needs_details:'Needs more details',unlinked:'No ISA link'})[s]||s}
function matchCard(row){
 const suggestions=window.StarIsaMatcher.evaluate(row,cards),area=text('div','','');
 area.append(text('h3','Possible goal matches'));
 if(!suggestions.length)area.append(text('p','No clear match. This report should remain an unlinked personal observation unless a reviewer has evidence to connect it.','muted'));
 suggestions.forEach(item=>{
  const box=text('div','','match');box.append(text('strong',item.title));
  box.append(text('p',item.reason));
  item.missing_detail.forEach(detail=>box.append(text('p',detail,'notes')));
  area.append(box);
 });
 return {area,suggestions};
}
async function updateReview(row,review_status,linked_outcome_id,note){
 if(!isAdmin)return;
 if(groupId!==await ensureActiveGroupId())throw Error('Your STAR test group changed. Refresh before reviewing.');
 const values={review_status,linked_outcome_id:linked_outcome_id||null,reviewer_note:(note||'').trim().slice(0,2000)};
 await rest('star_individual_observations_test?id=eq.'+encodeURIComponent(row.id)+'&group_id=eq.'+encodeURIComponent(groupId),
  {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(values)});
 await load();
}
function render(){
 queue.replaceChildren();
 if(!records.length){queue.append(text('p','No fictional self-reports are in this group yet.'));return;}
 records.forEach(row=>{
  const panel=text('section','','panel');
  panel.append(text('small',new Date(row.created_at).toLocaleString()+' · '+stateLabel(row.review_status)));
  panel.append(text('p',row.original_words,'words'));
  panel.append(text('p','Original response: '+(row.response_choice||'Not selected')+' · Support: '+(row.support_kind||'Not reported'),'muted'));
  const {area,suggestions}=matchCard(row);panel.append(area);
  if(row.review_status==='linked_observation'){
   const card=cards.find(x=>x.id===row.linked_outcome_id);
   panel.append(text('p','Reviewed link: '+(card?.title||'Archived/missing card')+' · outcome version '+row.linked_outcome_version,'status'));
  }
  if(row.reviewer_note)panel.append(text('p','Reviewer note: '+row.reviewer_note,'muted'));
  if(isAdmin){
    const pick=document.createElement('select');pick.setAttribute('aria-label','Proposed ISA outcome for '+row.original_words.slice(0,45));
    const first=document.createElement('option');first.value='';first.textContent='Select a possible goal';pick.append(first);
    suggestions.forEach(item=>{const opt=document.createElement('option');opt.value=item.outcome_id;opt.textContent=item.title;pick.append(opt)});
    if(row.linked_outcome_id && suggestions.some(x=>x.outcome_id===row.linked_outcome_id))pick.value=row.linked_outcome_id;
    const note=document.createElement('textarea');note.value=row.reviewer_note||'';note.maxLength=2000;note.placeholder='Reviewer notes (optional)';note.setAttribute('aria-label','Reviewer notes');
    panel.append(text('label','Review decision'));panel.append(pick,note);
    const controls=text('div','','actions');
    function act(label,newStatus,newId,style){
      const b=text('button',label,style||'');b.type='button';
      b.addEventListener('click',async()=>{
       if(newStatus==='linked_observation'&&!pick.value){message('Select a suggested goal card first.',true);return;}
       controls.querySelectorAll('button').forEach(x=>x.disabled=true);
       try{await updateReview(row,newStatus,newStatus==='linked_observation'?pick.value:null,note.value);message('Fictional observation review updated. No ISA progress was credited.')}
       catch(e){message(e.message||'Could not save review.',true);controls.querySelectorAll('button').forEach(x=>x.disabled=false)}
      });controls.append(b);
    }
    act('Link as observation (not progress)','linked_observation',pick.value);
    act('Need more details','needs_details',null,'alt');
    act('No goal link','unlinked',null,'alt');
    panel.append(controls);
  }
  queue.append(panel);
 });
}
async function load(){
 const [outcomes,rows]=await Promise.all([
  rest('star_isa_outcomes?select=id,group_id,individual_id,title,category,outcome_text,measurements,status,version&group_id=eq.'+encodeURIComponent(groupId)+'&individual_id=eq.&status=eq.active&limit=100'),
  rest('star_individual_observations_test?select=*&group_id=eq.'+encodeURIComponent(groupId)+'&order=created_at.desc&limit=100')
 ]);
 cards=outcomes||[];records=rows||[];render();message(records.length+' fictional self-report(s). '+(isAdmin?'Review available.':'Read-only view.'));
}
(async()=>{
 try{
  const session=getSessionFromStorage();if(!session?.user?.id)throw Error('Sign into STAR TEST before viewing.');
  groupId=await ensureActiveGroupId(session.user.id);if(!groupId)throw Error('Select your fictional test group first.');
  const members=await rest('group_members?select=role&group_id=eq.'+encodeURIComponent(groupId)+'&user_id=eq.'+encodeURIComponent(session.user.id));
  isAdmin=members?.[0]?.role==='admin';
  await load();
 }catch(e){message(e.message||'Unable to open fictional review queue.',true)}
})();
