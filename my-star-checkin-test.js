// UVM-only: voluntary fictional My STAR responses. This file is never used by STAR Live.
import {rest,getSessionFromStorage} from './restClient.js?v=2026.10.29UVM3';
import {ensureActiveGroupId} from './active-group.js?v=2026.10.29UVM3';
import {SUPABASE_URL} from './supabaseClient.js?v=2026.10.29UVM3';

export function isStarTestEnvironment(url,hostname) {
  return url === 'https://rjozzwmkvlndanoaghtc.supabase.co' &&
    ['star-uvm-testing.netlify.app','localhost','127.0.0.1'].includes(hostname);
}

export async function saveFictionalMyStarCheckin({responseType,responseValue,originalWords='',offeredOptions=[],supportKind='not_reported'} = {}) {
  if (!isStarTestEnvironment(SUPABASE_URL,location.hostname))
    throw new Error('Individual test saving is disabled outside STAR UVM Testing.');
  if (!['mood','comfort','daily_experience','leisure_preference'].includes(responseType))
    throw new Error('Choose a supported check-in question.');
  const answer=String(responseValue??'').trim();
  if (!answer || answer.length>500) throw new Error('Choose an answer or select Not now.');
  const exactWords=String(originalWords||'').trim();
  if (exactWords.length>2000) throw new Error('The response is too long.');
  const options=Array.isArray(offeredOptions)
    ? offeredOptions.map(v=>String(v).slice(0,160)).slice(0,20) : [];
  const session=getSessionFromStorage();
  const uid=session?.user?.id;
  if (!uid || !session.access_token) throw new Error('Sign in to STAR TEST to save a fictional answer.');
  const groupId=await ensureActiveGroupId(uid);
  if (!groupId || getSessionFromStorage()?.user?.id!==uid)
    throw new Error('Your test group or account changed. Sign in again.');
  const today=new Date();
  const checkinDate=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
  const payload={
    group_id:groupId,individual_id:'',author_user_id:uid,checkin_date:checkinDate,
    response_type:responseType,response_value:answer,original_words:exactWords,
    offered_options:options,support_kind:String(supportKind||'not_reported').slice(0,160),
    is_fictional:true
  };
  await rest('star_individual_checkins_test',{
    method:'POST',headers:{Prefer:'return=minimal'},
    body:JSON.stringify(payload),expectedUserId:uid
  });
  return {saved:true};
}
