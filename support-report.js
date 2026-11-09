import {checkinDateKey} from './caregiver-dates.js';

export function supportMinutes(value){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  if(!/^\d+$/.test(String(value).trim()))throw Error('Enter whole minutes from 0 to 1440, or leave time blank.');
  const n=Number(value);if(n>1440)throw Error('Support time cannot exceed 1440 minutes per entry.');return n;
}
export function normalizeSupportEntries(value){
  const rows=typeof value==='string'?JSON.parse(value):value;
  if(!Array.isArray(rows))throw Error('Support entries must be a list.');
  return rows.map(row=>({support:String(row.support||'').trim(),location:String(row.location||'').trim(),note:String(row.note||'').trim(),minutes:supportMinutes(row.minutes)})).filter(row=>row.support||row.location||row.note||row.minutes!==null);
}
// Same saved payload for ordinary check-ins and test fixtures. No project IDs,
// synthetic-user exceptions, or sample fallback values belong in reporting.
export function buildSupportUsage(records,{groupId,individualId,start='',end=''}={}){
  if(!groupId||individualId===undefined||individualId===null)throw Error('Choose a group and individual.');
  if(start&&end&&start>end)throw Error('Start date must precede end date.');
  const pairs=new Map(),seen=new Set(),evidence=[];
  let missingTime=0,invalidTime=0,totalMinutes=0;
  for(const record of records||[]){
    const p=record.payload||{},person=String(record.individual_id??p.individual_id??'');
    if(String(record.group_id??p.group_id??'')!==String(groupId)||person!==String(individualId))continue;
    const date=checkinDateKey(record);if(!date||(start&&date<start)||(end&&date>end))continue;
    if(record.id&&seen.has(record.id))continue;if(record.id)seen.add(record.id);
    let rows=p.shift_supports;try{if(typeof rows==='string')rows=JSON.parse(rows);}catch{continue;}
    if(!Array.isArray(rows))continue;
    for(const row of rows){
      if(!row?.support||!row.location)continue;
      let minutes=null;try{minutes=supportMinutes(row.minutes);}catch{invalidTime++;}
      if(minutes===null)missingTime++;else totalMinutes+=minutes;
      const key=JSON.stringify([row.support,row.location]);
      const item=pairs.get(key)||{support:row.support,location:row.location,entries:0,minutes:0,timedEntries:0};
      item.entries++;if(minutes!==null){item.minutes+=minutes;item.timedEntries++;}pairs.set(key,item);
      evidence.push({date,support:row.support,location:row.location,minutes,note:String(row.note||''),caregiver:String(record.caregiver_name||p.caregiver_name||'Caregiver'),recordId:record.id});
    }
  }
  return {pairs:[...pairs.values()].sort((a,b)=>a.support.localeCompare(b.support)||a.location.localeCompare(b.location)),evidence:evidence.sort((a,b)=>b.date.localeCompare(a.date)),missingTime,invalidTime,totalMinutes,entries:evidence.length};
}

export function renderSupportUsage(root,data,{unit='hours',caption=''}={}){
  root.replaceChildren();const doc=root.ownerDocument||document;
  const el=(tag,text,parent=root)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;parent.append(n);return n;};
  el('p',caption);
  el('p',data.entries+' support entries · '+(data.totalMinutes/60).toFixed(2)+' recorded hours · '+data.missingTime+' entries with time not recorded.').setAttribute('role','status');
  el('p','Times are recorded support-entry minutes. Split shared time between entries; do not count the same minutes twice. These are not billing totals.').className='muted';
  if(data.invalidTime)el('p',data.invalidTime+' entries have invalid time values and are excluded from hour totals.');
  const max=Math.max(1,...data.pairs.map(p=>unit==='hours'?p.minutes/60:p.entries));
  const chart=el('div');chart.className='support-bars';chart.setAttribute('aria-label',unit==='hours'?'Recorded hours by support and location':'Support-entry counts by support and location');
  for(const pair of data.pairs){
    const row=el('div',undefined,chart);row.className='support-bar-row';
    const value=unit==='hours'?pair.minutes/60:pair.entries;
    el('strong',pair.support+' · '+pair.location,row);
    const track=el('div',undefined,row);track.className='support-bar-track';const bar=el('div',undefined,track);bar.className='support-bar';bar.style.width=(value/max*100)+'%';bar.setAttribute('aria-hidden','true');
    el('span',unit==='hours'?(pair.timedEntries?value.toFixed(2)+' recorded hours':'Time not recorded'):value+' support entries',row);
  }
  if(!data.entries)el('p','No support entries for this individual and date range.');
  else if(unit==='hours'&&data.missingTime===data.entries)el('p','No durations were recorded. Choose Support-entry counts to view the recorded supports and locations.');
  const details=el('details');el('summary','View dated support entries',details);
  const wrap=el('div',undefined,details);wrap.className='support-table-wrap';const table=el('table',undefined,wrap);const head=el('tr',undefined,el('thead',undefined,table));
  for(const text of ['Date','Support','Location','Minutes','Caregiver','Note'])el('th',text,head).setAttribute('scope','col');
  const body=el('tbody',undefined,table);
  for(const entry of data.evidence){const row=el('tr',undefined,body);for(const value of [entry.date,entry.support,entry.location,entry.minutes===null?'Not recorded':String(entry.minutes),entry.caregiver,entry.note])el('td',value,row);}
}
