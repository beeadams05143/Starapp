import {roleLabels} from './role-home-model.mjs';
import {renderRoleHome} from './role-home-render.js?v=2026.11.09-dashboard-sections';
const tabs=document.querySelector('nav'),root=document.getElementById('screen');
function show(role){renderRoleHome(root,role,'Jamie Rivers',{preview:true});tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.role===role)));}
for(const [role,title] of Object.entries(roleLabels)){const b=document.createElement('button');b.textContent=title;b.dataset.role=role;b.onclick=()=>show(role);tabs.append(b);}
const requested=new URLSearchParams(location.search).get('role');show(Object.hasOwn(roleLabels,requested)?requested:'caregiver');
