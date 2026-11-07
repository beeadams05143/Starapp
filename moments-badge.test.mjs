import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const home=readFileSync('my-star.html','utf8');
const source=home.slice(home.indexOf('  var momentsCountRequest=0;'),home.indexOf("  window.addEventListener('pageshow'"))
 .replace("import('./restClient.js?v=2026.10.29UVM3')",'Promise.resolve(globalThis.client)')
 .replace("import('./active-group.js?v=2026.10.29UVM3')",'Promise.resolve(globalThis.groups)')
 .replace("import('./supabaseClient.js?v=2026.10.29UVM3')",'Promise.resolve(globalThis.config)');
async function run(user,people){
 const calls=[],small={},badges=[],tile={querySelector:s=>s==='small'?small:null,setAttribute(k,v){this[k]=v},append:n=>badges.push(n)};
 const context=vm.createContext({current:'home',Promise,location:{hostname:'star-uvm-testing.netlify.app'},
  screen:{querySelector:()=>tile},document:{createElement:()=>({setAttribute(){}})},
  groups:{ensureActiveGroupId:async()=> 'c40d0ac1-0122-46f6-b358-fac283287bb5'},config:{SUPABASE_URL:'https://rjozzwmkvlndanoaghtc.supabase.co'},
  client:{requireSession:async()=>({user:{id:user}}),rest:async(path,options)=>{
    assert.equal(options.expectedUserId,user);calls.push(path);
    if(path.startsWith('star_moments_test_people'))return people.map(individual_id=>({individual_id}));
    return [{star_moment_responses_test:null},{star_moment_responses_test:{satisfaction:'Not now'}},{star_moment_responses_test:{satisfaction:'I liked it'}}];
  }}});
 vm.runInContext(source,context);await context.refreshMomentsCount();return {calls,small,badges,tile};
}
test('badge counts waiting photos only for signed-in individual',async()=>{
 const {calls,small,badges}=await run('taylor',['jamie','taylor']);
 assert.ok(calls[1].includes('individual_id=eq.taylor'));
 assert.equal(small.textContent,'2 photos waiting');assert.equal(badges[0].textContent,'2 waiting');
});
test('caregiver demo badge uses Jamie only and labels preview',async()=>{
 const id='58d3ac51-3dc7-4ead-b22f-8cb5829a3bac';
 const {calls,tile}=await run('caregiver',[id,'taylor']);
 assert.ok(calls[1].includes('individual_id=eq.'+id));assert.match(tile['aria-label'],/fictional preview/);
});
test('unlinked account cannot display another individual count',async()=>{
 const {calls,badges}=await run('outsider',['taylor']);assert.equal(calls.length,1);assert.equal(badges.length,0);
});
