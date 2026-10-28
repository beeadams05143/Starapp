import { getSessionFromStorage, rest } from './restClient.js?v=2026.10.28D';
import { ensureActiveGroupId } from './active-group.js?v=2026.10.28D';
import { validSelectedDate } from './caregiver-submission.js';
import { formatCheckinDate } from './caregiver-dates.js';
import { CaregiverDraftService } from './caregiver-draft-service.js?v=2026.10.28D';

const DELETED_PREFIX = 'star-deleted-draft-v1:';
const browserPrefix = (userId,groupId) => 'star-checkin-recovery-v2:real:' + userId + ':' + groupId + ':';

// Browser recovery is automatic; Saved Drafts lists ONLY explicitly saved work.
// Automatic recovery remains intact for interruption protection, but is not a saved draft.
export function listHomeDrafts(storage,userId,groupId){
  if(!storage||!userId||!groupId)return [];
  const prefix=browserPrefix(userId,groupId),drafts=[];
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i);
    if(!key?.startsWith(prefix)||storage.getItem(DELETED_PREFIX+key))continue;
    try{
      const item=JSON.parse(storage.getItem(key));
      if(!item||item.phase==='verified'||item.attempt?.sent||item.intentionalDraft!==true)continue;
      if(item.cloudDraftId&&storage.getItem(DELETED_PREFIX+'cloud:'+userId+':'+groupId+':'+item.cloudDraftId))continue;
      if(item.context?.userId!==userId||item.context?.groupId!==groupId||item.context?.practice)continue;
      const date=item.draft?.data?.[0]?.entry_date;
      drafts.push({key,id:key.slice(prefix.length),date:validSelectedDate(date)?date:null,
        updatedAt:item.updatedAt||'',pending:false,source:'browser'});
    }catch{ /* Damaged recovery data is never silently discarded. */ }
  }
  return drafts.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function loadDrafts(win,userId,groupId){
  const local=listHomeDrafts(win.localStorage,userId,groupId);
  const service=new CaregiverDraftService({request:rest,userId,groupId});
  let cloud=[],cloudError=null;
  try{
    cloud=await service.list();
  }catch(error){cloudError=error}
  // Cloud drafts are verified records, never fictional samples or production imports.
  const saved=cloud.map(row=>({
    id:row.id,key:browserPrefix(userId,groupId)+row.id,
    date:validSelectedDate(row.checkin_date)?row.checkin_date:null,
    updatedAt:row.updated_at||'',source:'cloud'
  }));
  const ids=new Set(saved.map(d=>d.id));
  return {drafts:[...saved,...local.filter(d=>!ids.has(d.id))]
    .sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))),service,cloudError};
}

export async function getSavedDraftCount(win=window){
  const userId=getSessionFromStorage()?.user?.id;
  if(!userId)return 0;
  const groupId=await ensureActiveGroupId(userId);
  if(!groupId||getSessionFromStorage()?.user?.id!==userId)return 0;
  const result=await loadDrafts(win,userId,groupId);
  return result.drafts.length;
}

function el(doc,tag,text,className){
  const node=doc.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(className)node.className=className;
  return node;
}
export async function showHomeDrafts(doc=document,win=window){
  const host=doc.getElementById('homeSavedDrafts');if(!host)return;
  const session=getSessionFromStorage(),userId=session?.user?.id;
  if(!userId){win.location.replace('auth.html');return}
  host.replaceChildren(el(doc,'p','Checking your saved drafts…'));
  try{
    const groupId=await ensureActiveGroupId(userId);
    if(!groupId||getSessionFromStorage()?.user?.id!==userId)return;
    const result=await loadDrafts(win,userId,groupId);
    if(getSessionFromStorage()?.user?.id!==userId)return;
    host.replaceChildren();
    if(result.cloudError){
      const warn=el(doc,'p','Could not check cloud drafts. Only drafts on this device may appear. Refresh to try again.');
      warn.setAttribute('role','alert');host.append(warn);
    }
    if(!result.drafts.length){
      host.append(el(doc,'p','No saved drafts. An unfinished check-in only appears here after you choose Save Draft.'));
      return;
    }
    host.append(el(doc,'p','Only check-ins intentionally saved as drafts appear here. Automatic recovery copies are separate.'));
    for(const draft of result.drafts){
      const row=el(doc,'div',undefined,'saved-draft-row');
      row.style.cssText='display:flex;gap:9px;margin:12px 0;align-items:stretch';
      const link=el(doc,'a');
      const query=new URLSearchParams(draft.source==='cloud'?{resumeCloudDraft:draft.id}:{resumeDraft:draft.key});
      link.href='caregiver-checkin.html?'+query;
      link.style.cssText='flex:1;min-width:0;display:block;padding:14px;background:white;border:1px solid #d8d2c8;border-radius:12px;color:#2c2c2a;text-decoration:none';
      link.append(el(doc,'strong','Continue check-in'),el(doc,'div',
        (draft.date?formatCheckinDate(draft.date,'en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}):'Date not selected')+
        ' · '+(draft.source==='cloud'?'Saved securely':'Saved on this device')));
      const del=el(doc,'button','Delete');
      del.type='button';del.setAttribute('aria-label','Delete this saved draft');
      del.style.cssText='padding:12px;min-width:73px;border:1px solid #cc9b9b;border-radius:12px;background:white;color:#8f2424;font-weight:800';
      del.addEventListener('click',async()=>{
        if(!win.confirm('Permanently delete this unfinished saved draft?'))return;
        del.disabled=true;del.textContent='Deleting…';
        try{
          // Never hide a cloud draft unless its deletion was verified on the server.
          if(draft.source==='cloud')await result.service.delete(draft.id);
          // A tombstone prevents stale open check-in tabs from restoring this slot.
          const tombstone=new Date().toISOString();
          win.localStorage.setItem(DELETED_PREFIX+draft.key,tombstone);
          if(draft.source==='cloud'){
            win.localStorage.setItem(DELETED_PREFIX+'cloud:'+userId+':'+groupId+':'+draft.id,tombstone);
            // Retire copies of this same deleted cloud draft, not unrelated recovery work.
            const prefix=browserPrefix(userId,groupId);
            const toRetire=[];
            for(let i=0;i<win.localStorage.length;i++){
              const key=win.localStorage.key(i);
              if(!key?.startsWith(prefix))continue;
              try{
                const item=JSON.parse(win.localStorage.getItem(key));
                if(item?.cloudDraftId===draft.id||key===draft.key)toRetire.push(key);
              }catch{}
            }
            toRetire.forEach(key=>{
              win.localStorage.setItem(DELETED_PREFIX+key,tombstone);
              win.localStorage.removeItem(key);
            });
          }
          win.localStorage.removeItem(draft.key);
          row.remove();
          if(!host.querySelector('.saved-draft-row'))showHomeDrafts(doc,win);
        }catch(error){
          del.disabled=false;del.textContent='Delete';
          win.alert('Deletion could not be confirmed. '+(error?.message||'Please try again.'));
        }
      });
      row.append(link,del);host.append(row);
    }
  }catch(error){
    host.replaceChildren(el(doc,'p','Could not load saved drafts. Your drafts were not deleted.'));
    console.warn('[saved drafts] failed to load',error);
  }
}
if(typeof document!=='undefined')showHomeDrafts();
