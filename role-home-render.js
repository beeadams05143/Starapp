import {roleHome,roleLabels} from './role-home-model.mjs';
export function renderRoleHome(root,role,name,{preview=false}={}) {
  const view=roleHome(role,name);
  root.replaceChildren();
  function el(tag,text,parent=root){const n=document.createElement(tag);if(text)n.textContent=text;parent.append(n);return n;}
  el('p',roleLabels[role]+' view').className='role-label';
  el('h1',view.title);el('p',view.text);
  for(const section of view.sections){const box=el('section');if(section.title)el('h2',section.title,box);const cards=el('div',null,box);cards.className='role-cards';for(const card of section.cards){const link=el(preview?'div':'a',null,cards);link.className='role-card'+(card.urgent?' urgent':'');if(preview)link.setAttribute('aria-disabled','true');else link.href=card.href;link.setAttribute('data-card',card.href);el('strong',card.title,link);const icon=el('span',tileIcon(card.href),link);icon.className='role-icon';icon.setAttribute('aria-hidden','true');const detail=el('span',card.description,link);detail.className='role-description';link.setAttribute('aria-label',card.title+'. '+card.description);}}
  applyRoleBadges(root);
  if(role!=='administrator')el('p','Team role controls and invitation management are reserved for administrators.').className='muted';
}

function tileIcon(href){
  if(href.includes('checkin'))return '☑';
  if(href.includes('report'))return '▥';
  if(href.includes('isa'))return '◎';
  if(href.includes('chat'))return '▱';
  if(href.includes('calendar'))return '▦';
  if(href.includes('moment'))return '▧';
  if(href.includes('focus'))return '☆';
  if(href.includes('draft'))return '▤';
  if(href.includes('document')||href.includes('guide'))return '▣';
  if(href.includes('settings'))return '⚙';
  return '✧';
}
export function setRoleBadge(root,href,count,label){
  root.roleBadges ||= {};
  root.roleBadges[href]={count,label};
  applyRoleBadges(root);
}
function applyRoleBadges(root){
  for(const [href,{count,label}] of Object.entries(root.roleBadges||{})){
    const tile=root.querySelector('[data-card="'+href+'"]');if(!tile)continue;
    let badge=tile.querySelector('.role-badge');
    if(!count){badge?.remove();continue;}
    if(!badge){badge=document.createElement('span');badge.className='role-badge';tile.append(badge);}
    badge.textContent=typeof count==='number'?String(count):'!';
    badge.setAttribute('aria-label',label);
  }
}
