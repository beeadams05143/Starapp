import assert from 'node:assert/strict';
import { rest } from './restClient.js';
const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
const data = new Map();
globalThis.localStorage = {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
const key='supabase.auth.token:starapp:okfsobfyhpforyqogjea';
const save=(user='caregiver',expires=4102444800)=>data.set(key,JSON.stringify({currentSession:{user:{id:user},access_token:'test-only',refresh_token:'test-only',expires_at:expires}}));
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
try {
  let calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return response([]);};
  await assert.rejects(()=>rest('caregiver_checkins',{method:'POST',expectedUserId:'caregiver'}),/session required/);
  assert.equal(calls.length,0);
  save('other');
  await assert.rejects(()=>rest('caregiver_checkins',{method:'POST',expectedUserId:'caregiver'}),/caregiver changed/);
  assert.equal(calls.length,0);
  save(); const controller=new AbortController();controller.abort();
  await assert.rejects(()=>rest('caregiver_checkins',{method:'POST',expectedUserId:'caregiver',signal:controller.signal}),/abort/i);
  assert.equal(calls.length,0);
  // An expired session is refreshed before the request, without changing the caregiver.
  save('caregiver',1);
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    if(url.includes('/auth/v1/token'))return response({user:{id:'caregiver'},access_token:'fresh-test',refresh_token:'fresh-refresh',expires_at:4102444800});
    return response([]);
  };
  await rest('caregiver_checkins?select=id',{expectedUserId:'caregiver'});
  assert.equal(calls.length,2);
  assert.equal(calls[1].options.headers.Authorization,'Bearer fresh-test');
  // Server rejection preserves status for the caller; never silently returns success.
  calls=[];save();
  globalThis.fetch=async()=>response({message:'Not permitted'},403);
  await assert.rejects(()=>rest('caregiver_checkins',{expectedUserId:'caregiver'}),e=>e.status===403&&e.message==='Not permitted');
  // Abort during refresh: no delayed POST after the timeout.
  save('caregiver',1);const pending=new AbortController();let posts=0;
  globalThis.fetch=async(url)=>{
    if(url.includes('/auth/v1/token')){pending.abort();return response({user:{id:'caregiver'},access_token:'fresh-test',expires_at:4102444800});}
    posts++;return response([]);
  };
  await assert.rejects(()=>rest('caregiver_checkins',{method:'POST',expectedUserId:'caregiver',signal:pending.signal}),/abort/i);
  assert.equal(posts,0);
  console.log('Submission session refresh, identity lock, HTTP errors and cancellation: PASS');
} finally {
  globalThis.fetch=originalFetch;
  if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;
}
