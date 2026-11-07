import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CaregiverSubmission} from './caregiver-submission.js';
const row={id:'original-id',user_id:'u',group_id:'g',date:'2026-11-07',payload:{entry_date:'2026-11-07',shift_supports:[{support:'Community support',location:'Library'}]}};
function setup({existing=false,race=false,deny=false}={}){
 const requests=[];let stored=existing?structuredClone(row):null;
 const service=new CaregiverSubmission({newId:()=>{throw Error('Must never allocate new ID')},persistAttempt:()=>{},assertContext:()=>{if(deny)throw Error('Account changed')},request:async(path,opts={})=>{
  requests.push({path,...opts});
  if(opts.method==='POST'){
   assert.equal(path,'caregiver_checkins?on_conflict=id');assert.match(opts.headers.Prefer,/resolution=ignore-duplicates/);
   assert.deepEqual(JSON.parse(opts.body),[row]);if(race)stored=structuredClone(row);if(!stored)stored=JSON.parse(opts.body)[0];return [];
  }
  return stored?[stored]:[];
 }});service.attempt={sent:true,row:structuredClone(row)};return {service,requests};
}
test('recovery sends only original UUID and exact answers, then verifies',async()=>{const t=setup();assert.equal((await t.service.retryOriginal()).state,'verified');assert.equal(t.requests.filter(r=>r.method==='POST').length,1);assert.equal((await t.service.retryOriginal()).state,'verified');assert.equal(t.requests.filter(r=>r.method==='POST').length,1)});
test('existing original is read only',async()=>{const t=setup({existing:true});assert.equal((await t.service.retryOriginal()).state,'verified');assert.ok(t.requests.every(r=>r.method!=='POST'))});
test('delayed original insert is tolerated without overwriting',async()=>{const t=setup({race:true});assert.equal((await t.service.retryOriginal()).state,'verified')});
test('changed account prevents any network request',async()=>{const t=setup({deny:true});assert.equal((await t.service.retryOriginal()).state,'uncertain');assert.equal(t.requests.length,0)});
