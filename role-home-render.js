import {roleHome,roleLabels} from './role-home-model.mjs';
export function renderRoleHome(root,role,name,{preview=false}={}) {
  const view=roleHome(role,name);
  root.replaceChildren();
  function el(tag,text,parent=root){const n=document.createElement(tag);if(text)n.textContent=text;parent.append(n);return n;}
  el('p',roleLabels[role]+' view').className='role-label';
  el('h1',view.title);el('p',view.text);
  for(const section of view.sections){const box=el('section');if(section.title)el('h2',section.title,box);const cards=el('div',null,box);cards.className='role-cards';for(const card of section.cards){const link=el(preview?'div':'a',null,cards);link.className='role-card'+(card.urgent?' urgent':'');if(preview)link.setAttribute('aria-disabled','true');else link.href=card.href;el('strong',card.title,link);el('span',card.description,link);}}
  if(role!=='administrator')el('p','Team role controls and invitation management are reserved for administrators.').className='muted';
}
