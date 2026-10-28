/* STAR sandbox: transparent suggestions only. No data mutation or progress calculation. */
(function(root){
 'use strict';
 const rules=[
  {kind:'phone',card:/\b(phone|calling|call|dial|communication|siri)\b/i,
   report:/\b(phone|call|called|calling|dial|dialed|facetime)\b/i,
   reason:'Reported something related to a phone call or dialing.'},
  {kind:'community',card:/\b(community|outing|outings|participation|destination)\b/i,
   report:/\b(went to|visited|attended|participated|walked|went out|traveled|travelled|went with)\b.{0,55}\b(park|community|library|store|shop|museum|pool|center|event|market|out|walk|recreation)\b|\b(park|library|store|museum|community|center|pool|market|shop)\b.{0,50}\b(went|visited|attended|walked|with)\b/i,
   reason:'Reported visiting or participating somewhere in the community.'},
  {kind:'preference',card:/\b(choose|choice|chosen|preferred|preference|leisure|self.direction|select)\b/i,
   report:/\b(chose|choose|choosing|picked|pick|selected|decided|rather|prefer|preferred|choice)\b/i,
   reason:'Expressed a choice or preference; participation is not established.'}
 ];
 const words=s=>String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean);
 const stop=new Set('a an the and or my i me we you they to for of was were is are did it something that this today help helped with group goal fictional test record minute minutes step steps outcome card support activity individual practice practiced'.split(' '));
 const meaningful=s=>new Set(words(s).filter(w=>w.length>3&&!stop.has(w)));
 function evaluate(observation,cards){
  const raw=String(observation?.original_words||observation?.words||'').trim();
  if(!raw||!Array.isArray(cards))return [];
  const obs=meaningful(raw), results=[];
  for(const card of cards){
   if(!card||card.status!=='active'||!card.id)continue;
   const cardText=[card.title,card.category,card.outcome_text,...(Array.isArray(card.measurements)?card.measurements.map(m=>[m.label,m.activity].join(' ')):[])].join(' ');
   let reason='',basis='';
   for(const rule of rules){
    if(rule.card.test(cardText)&&rule.report.test(raw)){reason=rule.reason;basis=rule.kind;break}
   }
   // Other ISA cards can be proposed when the individual actually names two meaningful terms.
   if(!reason){
    const overlap=[...meaningful([card.title,...(card.measurements||[]).map(x=>x.activity||'')].join(' '))].filter(w=>obs.has(w));
    if(overlap.length>=2){reason='Shared activity words: '+overlap.slice(0,3).join(', ')+'.';basis='overlap'}
   }
   if(!reason)continue;
   const measurements=Array.isArray(card.measurements)?card.measurements:[];
   let missing=[];
   measurements.forEach(m=>{
    if(m.kind==='count')missing.push('Confirm the observed '+(m.label||'count')+' ('+(m.unit||'count')+').');
    if(m.kind==='duration')missing.push('Confirm actual '+(m.label||'duration')+' ('+(m.unit||'time')+').');
    if(m.kind==='choice')missing.push('A preference does not mean the activity occurred; confirm the recorded measurement.');
   });
   results.push({outcome_id:card.id,outcome_version:card.version||1,title:card.title,reason,basis,missing_detail:missing});
  }
  return results.slice(0,5);
 }
 root.StarIsaMatcher={evaluate};
})(typeof window!=='undefined'?window:globalThis);
