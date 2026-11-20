import {loadRoleContext} from './role-context.js?v=2026.11.19F';
import {renderRoleHome,setRoleBadge} from './role-home-render.js?v=2026.11.19F';
import {unreadMessagesQuery} from './chat-alerts.js';
import {rest,getSessionFromStorage} from './restClient.js';
import {getSavedDraftCount} from './home-saved-drafts.js?v=2026.10.28D';
const status=document.getElementById('homeStatus'),root=document.getElementById('roleHome');
async function init(){
  const context=await loadRoleContext();
  if(!context.group){status.textContent='Create or join a group to open your team workspace.';const a=document.createElement('a');a.href='group-setup.html';a.textContent=' Create or join a group';status.append(a);return;}
  if(context.role==='individual'){location.replace('my-star.html');return;}
  const people=context.members.filter(m=>m.assigned_role==='individual');
  const displayName=people.length===1 ? people[0].display_name?.trim() : '';
  const name=displayName && !displayName.includes('@')
    ? displayName
    : people.length>1 ? 'the individuals on your team' : 'the individual';
  renderRoleHome(root,context.role,name,{workspaceName:context.groupName});root.hidden=false;status.textContent='Signed in as '+context.self.display_name+'.';
  // Badge state survives switching between previews and the working Admin home.
  async function refreshBadges(){
    if(getSessionFromStorage()?.user?.id!==context.uid)return;
    const apply=(href,count,label)=>{if(getSessionFromStorage()?.user?.id===context.uid)setRoleBadge(root,href,count,label);};
    await Promise.allSettled([
      getSavedDraftCount(window).then(count=>apply('saved-drafts.html',count,count+' saved drafts')),
      rest('messages?'+unreadMessagesQuery(context.uid,context.group),{expectedUserId:context.uid}).then(rows=>apply('chat.html',rows?.length?'!':0,'Unread team messages')),
      ...(context.role==='administrator'?[rest('star_individual_observations?select=id&group_id=eq.'+context.group+'&review_status=eq.pending',{expectedUserId:context.uid}).then(rows=>apply('my-star-isa-review.html',rows?.length||0,(rows?.length||0)+' observations awaiting review'))]:[])
    ]);
  }
  refreshBadges();
  window.setInterval?.(refreshBadges,15000);
  if(context.role!=='case_manager'){
    document.getElementById('activitySection').hidden=false;
    await import('./home-activity.js');
  }
}
init().catch(error=>{root.hidden=true;status.textContent='Could not open your role dashboard. '+error.message;const retry=document.createElement('button');retry.textContent='Try again';retry.onclick=()=>location.reload();status.append(retry);});

// Re-resolve membership after returning from the browser back/forward cache.
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
