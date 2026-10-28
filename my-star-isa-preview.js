import { rest, getSessionFromStorage } from './restClient.js?v=2025.01.09E';
import { ensureActiveGroupId } from './active-group.js';
// STAR TEST only: participants can try fictional text without updating outcome progress.
let context=null;
async function getContext(){
 const session=getSessionFromStorage();if(!session?.user?.id)throw Error('Sign into STAR TEST to try matching fictional goals.');
 const groupId=await ensureActiveGroupId(session.user.id);if(!groupId)throw Error('Select your fictional STAR TEST group first.');
 if(context?.groupId===groupId&&context?.userId===session.user.id)return context;
 const cards=await rest('star_isa_outcomes?select=id,group_id,title,category,outcome_text,measurements,status,version&group_id=eq.'+
  encodeURIComponent(groupId)+'&individual_id=eq.&status=eq.active&limit=100');
 context={userId:session.user.id,groupId,cards:cards||[]};return context;
}
function drawResults(matches){
 const host=document.getElementById('isaPreview');if(!host)return;
 host.replaceChildren();
 const title=document.createElement('p');title.style.fontWeight='800';
 title.textContent=matches.length?'Possible ISA links — review needed:':'No clear goal match.';
 host.append(title);
 if(!matches.length){const p=document.createElement('p');p.textContent='That is okay. What the person said still matters even if it does not match an ISA goal.';host.append(p)}
 matches.forEach(match=>{
  const item=document.createElement('div');item.className='match-preview';
  const strong=document.createElement('strong');strong.textContent=match.title;
  const reason=document.createElement('p');reason.textContent=match.reason;
  item.append(strong,reason);
  for(const needed of match.missing_detail){const p=document.createElement('p');p.textContent=needed;p.style.fontSize='14px';item.append(p)}
  host.append(item);
 });
 const note=document.createElement('p');note.textContent='These are suggestions only. Nothing was credited or added to a report.';
 host.append(note);
}
async function runPreview(payload){
 const c=await getContext();
 const matches=window.StarIsaMatcher.evaluate({original_words:payload.words},c.cards);
 drawResults(matches);return matches;
}
window.StarIsaTest={
 async preview(payload){return runPreview(payload)},
 async save(payload){
  const words=String(payload.words||'').trim();
  if(!/^FICTIONAL:/i.test(words))throw Error('For safety, only fictional examples beginning with “FICTIONAL:” can be saved in the test database.');
  if(words.length>2000)throw Error('The example is too long.');
  const c=await getContext();
  const matches=window.StarIsaMatcher.evaluate({original_words:words},c.cards);
  const data={
   group_id:c.groupId,individual_id:'',author_user_id:c.userId,
   original_words:words,expression_type:'accomplishment',
   response_choice:payload.response_choice||'',support_kind:payload.support_kind||'not_reported',
   possible_matches:matches.map(({outcome_id,outcome_version,reason})=>({outcome_id,outcome_version,reason}))
  };
  const values=await rest('star_individual_observations_test',
   {method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(data)});
  return {record:values?.[0],matches};
 }
};