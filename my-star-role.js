import {loadRoleContext} from './role-context.js';
import {roleHome} from './role-home-model.mjs';
// Keep the preview and real home labels/order in sync while retaining My STAR's
// existing buttons, pictures, event handlers, badge, and answer workflows.
function syncHome(){
  const screen=document.getElementById('screen'),grid=screen.querySelector('.tiles');
  if(!screen.classList.contains('role-home-panel')||!grid)return;
  const actions={'my-star.html?page=urgent':'urgent','my-star.html?page=pain':'pain','my-star.html?page=feel':'feel','my-star.html?page=day':'day','star-moments-test.html?mode=review':'moments','chat.html':'chat','communication.html?view=mine':'communication','support-preparation.html':'support-preparation','my-star.html?page=goals':'goals','my-star.html?page=rather':'rather','my-star-voice.html':'voice'};
  for(const card of roleHome('individual').sections[0].cards){
    const button=screen.querySelector('[data-open="'+actions[card.href]+'"]');
    if(!button)continue;
    button.querySelector('strong').textContent=card.title;
    // Preserve a live waiting-photo count once it has loaded.
    if(card.href!=='star-moments-test.html?mode=review'||!button.querySelector('.moment-waiting-badge'))button.querySelector('small').textContent=card.description;
    grid.append(button);
  }
  screen.querySelectorAll('.tiles').forEach(n=>{if(n!==grid&&!n.children.length)n.remove();});
}
window.addEventListener('star:home-rendered',syncHome);
syncHome();
// A supporter's device keeps its real account and the existing assisted-answer attribution.
async function init(){
  const context=await loadRoleContext();
  if(!context.group)throw Error('Join a team before sharing answers.');
  const own=context.role==='individual';
  const name=own?context.self.display_name:'';
  window.starIndividualName=name;
  document.querySelector('.star-view-switch').hidden=own;
  if(!own){const note=document.querySelector('.preview-notice');note.textContent='Assisted My STAR on your signed-in device. The answer screens identify the individual and record who helped. Your team role stays the same.';}
  window.dispatchEvent(new Event('star:identity'));
  syncHome();
}
init().catch(error=>{document.querySelector('.preview-notice').textContent=error.message;});
