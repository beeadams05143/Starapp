import {loadRoleContext} from './role-context.js';
import {renderRoleHome} from './role-home-render.js';
import {rest,getSessionFromStorage} from './restClient.js';
import {getSavedDraftCount} from './home-saved-drafts.js?v=2026.10.28D';
const status=document.getElementById('homeStatus'),root=document.getElementById('roleHome');
async function init(){
  const context=await loadRoleContext();
  if(!context.group){status.textContent='Create or join a group to open your team workspace.';const a=document.createElement('a');a.href='group-setup.html';a.textContent=' Create or join a group';status.append(a);return;}
  if(context.role==='individual'){location.replace('my-star.html');return;}
  const people=context.members.filter(m=>m.assigned_role==='individual');
  const name=people.length===1?people[0].display_name:people.length?'the individuals on your team':'the individual';
  renderRoleHome(root,context.role,name);root.hidden=false;status.textContent='Signed in as '+context.self.display_name+'.';
  // Counts retain their original account/group scope after the dashboard redesign.
  getSavedDraftCount(window).then(count=>{
    if(getSessionFromStorage()?.user?.id!==context.uid)return;
    const link=root.querySelector('a[href="saved-drafts.html"] strong');
    if(link&&count)link.textContent='Saved Drafts · '+count;
  }).catch(()=>{});
  if(context.role==='administrator'){
    rest('star_individual_observations_test?select=id&group_id=eq.'+context.group+'&review_status=eq.pending',{expectedUserId:context.uid}).then(rows=>{
      if(getSessionFromStorage()?.user?.id!==context.uid)return;
      const link=root.querySelector('a[href="my-star-isa-review.html"] strong');
      if(link&&rows?.length)link.textContent='Review My STAR Observations · '+rows.length+' waiting';
    }).catch(()=>{});
  }
  document.getElementById('activitySection').hidden=false;
  await import('./home-activity.js');
}
init().catch(error=>{root.hidden=true;status.textContent='Could not open your role dashboard. '+error.message;const retry=document.createElement('button');retry.textContent='Try again';retry.onclick=()=>location.reload();status.append(retry);});

// Re-resolve membership after returning from the browser back/forward cache.
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
