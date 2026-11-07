import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {isMyStarAlert,unreadMessagesQuery} from './chat-alerts.js';
test('shared-device urgent messages are included without counting ordinary self messages',()=>{
 const query=unreadMessagesQuery('me','team');
 assert.equal(query.get('group_id'),'eq.team');assert.equal(query.get('message_reads.user_id'),'eq.me');assert.equal(query.get('message_reads'),'is.null');
 assert.equal(query.has('sender_id'),false);
 assert.equal(query.get('or'),'(sender_id.neq.me,message.like.[STAR TEST] 🚨 Help now*,message.like.[STAR TEST] 🩹 Something hurts*)');
 assert.equal(isMyStarAlert('[STAR TEST] 🩹 Something hurts: Head'),true);
 assert.equal(isMyStarAlert('[STAR TEST] 🚨 Help now. I need help.'),true);
 assert.equal(isMyStarAlert('Ordinary message'),false);
 const help=unreadMessagesQuery('me','team',{helpOnly:true});assert.doesNotMatch(help.get('or'),/sender_id/);
});
test('opening visible Chat clears own My STAR alerts and other team messages only',async()=>{
 const source=readFileSync('chat.js','utf8');
 const fragment=source.slice(source.indexOf('async function markReadFor('),source.indexOf('\n// ---------- render'));
 const posts=[];const document={hidden:false};
 const context=vm.createContext({document,isMyStarAlert,rest:async(path,options)=>posts.push({path,rows:JSON.parse(options.body)})});
 vm.runInContext(fragment,context);
 const messages=[{id:'help',sender_id:'me',message:'[STAR TEST] 🚨 Help now: I need someone'},{id:'mine',sender_id:'me',message:'ordinary'},{id:'other',sender_id:'other',message:'hello'}];
 await context.markReadFor(messages,'me');assert.deepEqual(posts[0].rows.map(x=>x.message_id),['help','other']);
 document.hidden=true;await context.markReadFor(messages,'me');assert.equal(posts.length,1,'background chat does not clear alerts');
});
test('one Send action returns home after a confirmed chat write without Done',async()=>{
 const source=readFileSync('my-star.html','utf8');
 for(const title of ['Something Hurts','🚨 HELP NOW']){
  const line=source.split('\n').find(line=>line.includes("wrap('"+title+"'"));assert.match(line,/Send to my team/);assert.doesNotMatch(line,/button\('Done'/);
 }
 let fn=source.slice(source.indexOf('  function sendChatNotice('),source.indexOf("  screen.addEventListener('click'"));
 fn=fn.replace("import('./restClient.js?v=2026.10.29UVM3')",'Promise.resolve(globalThis.client)').replace("import('./active-group.js?v=2026.10.29UVM3')",'Promise.resolve(globalThis.groups)').replace("import('./supabaseClient.js?v=2026.10.29UVM3')",'Promise.resolve(globalThis.config)');
 const posts=[];let completed=0;
 const context=vm.createContext({crypto:{randomUUID:()=> 'same-id'},location:{hostname:'star-uvm-testing.netlify.app'},config:{SUPABASE_URL:'https://rjozzwmkvlndanoaghtc.supabase.co'},groups:{ensureActiveGroupId:async()=> 'team'},client:{requireSession:async()=>({user:{id:'me'}}),rest:async(path,opts)=>posts.push({path,row:JSON.parse(opts.body)})}});
 vm.runInContext(fn,context);
 await context.sendChatNotice({},'[STAR TEST] 🩹 Something hurts: Head',{},()=>completed++);
 assert.equal(completed,1);assert.equal(posts[0].row.sender_id,'me');assert.equal(posts[0].row.group_id,'team');
 const action=source.slice(source.indexOf("    if(action==='chat-details')"),source.indexOf("    if(action==='done')"));
 assert.match(action,/render\('home'\);status\('✓ Sent to my team.'/);
});
