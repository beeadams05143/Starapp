import {renderRoleHome} from '../role-home-render.js?v=2026.11.09-tiles';
export function mountRoleSwitch({context,root,name,restore}) {
  if(location.hostname!=='star-uvm-testing.netlify.app'||context.role!=='administrator')return;
  const panel=document.createElement('section');
  panel.className='notice';
  panel.setAttribute('aria-label','Testing role preview');
  const title=document.createElement('strong');title.textContent='Testing only · View dashboard as';
  const tabs=document.createElement('div');tabs.className='role-tabs';
  const note=document.createElement('p');note.setAttribute('role','status');
  const options=[['caregiver','Caregiver'],['administrator','Admin'],['case_manager','Case Manager']];
  function show(role){
    for(const button of tabs.children)button.setAttribute('aria-pressed',String(button.dataset.role===role));
    if(role==='administrator'){
      restore();note.textContent='Your Admin dashboard. Your account and permissions are unchanged.';
    }else{
      renderRoleHome(root,role,name,{preview:true});
      note.textContent='Preview only: '+options.find(x=>x[0]===role)[1]+' dashboard. Cards are inactive. Choose Admin to return to your working dashboard.';
    }
  }
  for(const [role,label] of options){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.role=role;button.onclick=()=>show(role);tabs.append(button);}
  panel.append(title,tabs,note);root.before(panel);show('administrator');
}
