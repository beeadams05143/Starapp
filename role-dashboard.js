import {loadRoleContext} from './role-context.js';
import {renderRoleHome,setRoleBadge} from './role-home-render.js?v=2026.11.09-tiles';
import {unreadMessagesQuery} from './chat-alerts.js';
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
  /* TEST_ROLE_SWITCH_START */
  if(location.hostname==='star-uvm-testing.netlify.app' && context.role==='administrator'){
    const {mountRoleSwitch}=await import('./scripts/test-role-switch.js?v=2026.11.09');
    mountRoleSwitch({context,root,name,restore:()=>renderRoleHome(root,context.role,name)});
  }
  /* TEST_ROLE_SWITCH_END */
  // Badge state survives switching between previews and the working Admin home.
  async function refreshBadges(){
    if(getSessionFromStorage()?.user?.id!==context.uid)return;
    const apply=(href,count,label)=>{if(getSessionFromStorage()?.user?.id===context.uid)setRoleBadge(root,href,count,label);};
    await Promise.allSettled([
      getSavedDraftCount(window).then(count=>apply('saved-drafts.html',count,count+' saved drafts')),
      rest('messages?'+unreadMessagesQuery(context.uid,context.group),{expectedUserId:context.uid}).then(rows=>apply('chat.html',rows?.length?'!':0,'Unread team messages')),
      ...(context.role==='administrator'?[rest('star_individual_observations_test?select=id&group_id=eq.'+context.group+'&review_status=eq.pending',{expectedUserId:context.uid}).then(rows=>apply('my-star-isa-review.html',rows?.length||0,(rows?.length||0)+' observations awaiting review'))]:[])
    ]);
  }
  refreshBadges();
  window.setInterval?.(refreshBadges,15000);
  document.getElementById('activitySection').hidden=false;
  await import('./home-activity.js');
}
init().catch(error=>{root.hidden=true;status.textContent='Could not open your role dashboard. '+error.message;const retry=document.createElement('button');retry.textContent='Try again';retry.onclick=()=>location.reload();status.append(retry);});

// Re-resolve membership after returning from the browser back/forward cache.
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
