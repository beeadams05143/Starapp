import {renderRoleHome} from '../role-home-render.js?v=2026.11.09-dashboard-sections';
export function mountRoleSwitch({context,root,name,restore}) {
  if(location.hostname!=='star-uvm-testing.netlify.app'||context.role!=='administrator')return;
  const panel=document.createElement('section');panel.className='test-role-switch';panel.setAttribute('aria-label','Testing role preview');
  const label=document.createElement('label');label.textContent='Test view';
  const select=document.createElement('select');
  for(const [value,text] of [['administrator','Admin'],['caregiver','Caregiver'],['case_manager','Case Manager']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
  label.append(select);
  const note=document.createElement('p');note.setAttribute('role','status');
  select.onchange=()=>{
    root.dashboardGroup='overview';
    if(select.value==='administrator'){restore();note.textContent='Working Admin view.';}
    else{renderRoleHome(root,select.value,name,{preview:true});note.textContent='Preview only · Cards are inactive.';}
  };
  panel.append(label,note);root.before(panel);select.onchange();
}
