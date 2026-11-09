import {roleHome,roleLabels} from './role-home-model.mjs';
import {dashboardGroups,shortTitles,iconPaths} from './dashboard-layout.mjs';
export function renderRoleHome(root,role,name,{preview=false}={}) {
  const view=roleHome(role,name),groups=dashboardGroups(view,role);
  root.replaceChildren();
  function el(tag,text,parent=root){const n=document.createElement(tag);if(text)n.textContent=text;parent.append(n);return n;}
  const header=el('header');header.className='dashboard-heading';
  el('p',roleLabels[role]+(preview?' · Preview':''),header).className='role-label';
  el('h1',role==='case_manager'?'Team overview':'Your STAR dashboard',header);
  el('p',name.replace(/ — Fictional Individual$/,'')+' · '+(preview?'View only':'Team workspace'),header).className='dashboard-person';
  const nav=el('nav');nav.className='dashboard-menu';nav.setAttribute('aria-label','Dashboard sections');nav.setAttribute('data-columns',String(groups.length));
  const content=el('div');content.className='dashboard-content';
  const buttons=[],panels=[];
  for(const group of groups){
    const button=el('button',group.title,nav);button.type='button';button.setAttribute('data-group',group.id);
    const panel=el('section',null,content);panel.id='dashboard-'+group.id;panel.className='dashboard-panel';
    button.setAttribute('aria-controls',panel.id);el('h2',group.heading,panel);
    const cards=el('div',null,panel);cards.className='role-cards';
    for(const card of group.cards){
      const link=el(preview?'div':'a',null,cards);link.className='role-card'+(card.urgent?' urgent':'');
      if(preview)link.setAttribute('aria-disabled','true');else link.href=card.href;
      link.setAttribute('data-card',card.href);
      el('strong',shortTitles[card.href]||card.title,link);
      const icon=el('span',null,link);icon.className='role-icon';icon.setAttribute('aria-hidden','true');
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round',width:'26',height:'26'}))svg.setAttribute(key,value);
      for(const d of iconPaths(card.href)){const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);svg.append(path);}icon.append(svg);
      link.setAttribute('aria-label',card.title+'. '+card.description);
    }
    buttons.push(button);panels.push(panel);
    button.onclick=()=>select(group.id);
  }
  function select(id){
    root.dashboardGroup=id;
    groups.forEach((group,i)=>{const active=group.id===id;panels[i].hidden=!active;buttons[i].setAttribute('aria-pressed',String(active));});
  }
  select(groups.some(g=>g.id===root.dashboardGroup)?root.dashboardGroup:'overview');
  root.dashboardGroups=groups;
  applyRoleBadges(root);
}

export function setRoleBadge(root,href,count,label){
  root.roleBadges ||= {};
  root.roleBadges[href]={count,label};
  applyRoleBadges(root);
}
function applyRoleBadges(root){
  for(const group of root.dashboardGroups||[]){
    const button=root.querySelector('[data-group="'+group.id+'"]');
    if(button){const hasAlert=group.cards.some(card=>root.roleBadges?.[card.href]?.count);button.setAttribute('data-notification',String(hasAlert));button.setAttribute('aria-label',group.title+(hasAlert?' · Has notifications':''));}
  }
  for(const [href,{count,label}] of Object.entries(root.roleBadges||{})){
    const tile=root.querySelector('[data-card="'+href+'"]');if(!tile)continue;
    let badge=tile.querySelector('.role-badge');
    if(!count){badge?.remove();continue;}
    if(!badge){badge=document.createElement('span');badge.className='role-badge';tile.append(badge);}
    badge.textContent=typeof count==='number'?String(count):'!';
    badge.setAttribute('aria-label',label);
  }
}
