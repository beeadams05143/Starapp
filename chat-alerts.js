// My STAR communications must notify the team even on a caregiver's signed-in device.
export const helpPrefixes=['[STAR TEST] 🚨 Help now','[STAR TEST] 🩹 Something hurts'];
export function isMyStarAlert(message){
  return helpPrefixes.some(prefix=>String(message||'').startsWith(prefix));
}
export function unreadMessagesQuery(userId,groupId,{helpOnly=false}={}){
  const help=helpPrefixes.map(prefix=>'message.like.'+prefix+'*');
  return new URLSearchParams({
    select:helpOnly?'id,message,message_reads()':'id,message_reads()',
    group_id:'eq.'+groupId,
    or:'('+[...(helpOnly?[]:['sender_id.neq.'+userId]),...help].join(',')+')',
    'message_reads.user_id':'eq.'+userId,
    message_reads:'is.null',order:'created_at.desc,id.desc',limit:'1'
  });
}
