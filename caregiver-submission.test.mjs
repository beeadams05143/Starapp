import assert from 'node:assert/strict';
import { CaregiverSubmission, CheckinRecoveryStore, verifySavedCheckin, validSelectedDate } from './caregiver-submission.js';
import { formatCheckinDate } from './caregiver-dates.js';

const row = { user_id: 'caregiver', group_id: 'group', date: '2026-10-08', payload: { entry_date: '2026-10-08', example_answer: 'kept' }, submitted_at: '2026-10-10T15:00:00Z' };
function setup(overrides = {}) {
  const records = [], requests = [], snapshots = [];
  let serial = 0;
  const options = {
    assertContext: candidate => {
      assert.equal(candidate.user_id, 'caregiver'); assert.equal(candidate.group_id, 'group');
    },
    newId: () => `attempt-${++serial}`,
    persistAttempt: attempt => snapshots.push(structuredClone(attempt)),
    request: async (path, opts) => {
      requests.push({ path, ...opts });
      if (opts.method === 'POST') {
        const saved = JSON.parse(opts.body)[0]; records.push(saved); return [saved];
      }
      if (path.includes('&id=eq.')) return records.filter(r => path.includes(`&id=eq.${r.id}&`));
      return records;
    }, ...overrides
  };
  return { service: new CaregiverSubmission(options), options, records, requests, snapshots };
}
for (const date of ['2026-10-01', '2026-10-07', '2026-10-08', '1900-01-01', '2026-09-30', '2026-11-01']) assert.ok(validSelectedDate(date));
for (const date of ['', '2026-02-30', '2026-13-01', '10/8/2026', '2026-10-08T00:00:00Z']) assert.equal(validSelectedDate(date), false);
const tz = process.env.TZ;
for (const zone of ['America/New_York', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC', 'Asia/Kolkata']) {
  process.env.TZ = zone;
  assert.equal(formatCheckinDate(row.date, 'en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }), 'Thursday, October 8, 2026');
}
if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;

let t = setup();
assert.equal((await t.service.submit(row)).state, 'failed');
assert.equal(t.requests.length, 0);
let result = await t.service.submit(row, { confirmed: true });
assert.equal(result.state, 'verified');
assert.equal(result.row.date, '2026-10-08');
assert.equal(result.row.payload.entry_date, '2026-10-08');
assert.equal(result.row.submitted_at, '2026-10-10T15:00:00Z');
assert.equal(t.snapshots[0].row.id, result.row.id);
assert.ok(t.requests.every(r => r.method === 'POST' || (r.path.includes('group_id=eq.group') && r.path.includes('user_id=eq.caregiver'))));
await t.service.submit(row, { confirmed:true });
assert.equal(t.records.length, 1, 'retry only reconciles the original ID');
for (const mutation of [ { id:'wrong' }, { date:'2026-10-07' }, { payload:{entry_date:'2026-10-07'} }, { user_id:'wrong' }, {group_id:'wrong'} ]) {
  assert.equal(verifySavedCheckin({ ...result.row, ...mutation }, result.row), false);
}

for (const field of ['date', 'payload', 'user_id', 'group_id', 'id']) {
  t = setup({ request: async (path, opts) => {
    if (opts.method !== 'POST') return [];
    const saved = JSON.parse(opts.body)[0];
    saved[field] = field === 'payload' ? { entry_date:'2026-10-07' } : 'wrong';
    return [saved];
  }});
  assert.equal((await t.service.submit(row,{confirmed:true})).state,'uncertain');
}

t = setup({ assertContext: () => { throw Error('Authentication failed or context changed'); } });
assert.equal((await t.service.submit(row, {confirmed:true})).state,'failed');
assert.equal(t.requests.length,0);
assert.equal(row.payload.example_answer,'kept');
t = setup({ persistAttempt: () => { throw Error('Quota exceeded'); } });
assert.equal((await t.service.submit(row,{confirmed:true})).state,'failed');
assert.equal(t.requests.filter(r=>r.method==='POST').length,0);
assert.equal(t.service.attempt,null);

t = setup();
t.records.push({...row,id:'existing'});
result=await t.service.submit(row,{confirmed:true});
assert.equal(result.state,'duplicate');
assert.equal(t.requests.filter(r=>r.method==='POST').length,0);
assert.equal((await t.service.submit(row,{confirmed:true,approvedDuplicateIds:['existing']})).state,'verified');
assert.equal(t.records.length,2);
assert.equal(t.records[0].id,'existing');
// Payload-only legacy duplicates are detected as well.
t=setup(); t.records.push({id:'legacy',date:null,payload:{entry_date:row.date}});
assert.equal((await t.service.submit(row,{confirmed:true})).state,'duplicate');

// Commit succeeded, but the POST response was lost: reconcile without another insert.
t=setup();
const originalRequest=t.options.request;
t.service.request=async(path,opts)=>{
  const response=await originalRequest(path,opts);
  if(opts.method==='POST') throw Error('Lost response');
  return response;
};
assert.equal((await t.service.submit(row,{confirmed:true})).state,'verified');
assert.equal(t.records.length,1);

// No way to establish whether a write happened: reload preserves ID and can only read.
t=setup(); let writes=0;
t.service.request=async(path,opts)=>{
  if(opts.method==='POST'){writes++;throw Error('Network disconnected');}
  return [];
};
result=await t.service.submit(row,{confirmed:true});
assert.equal(result.state,'uncertain');
const recovered=new CaregiverSubmission({...t.options,request:t.service.request});
recovered.attempt=structuredClone(t.snapshots[0]);
assert.equal((await recovered.submit(row,{confirmed:true})).state,'uncertain');
assert.equal(writes,1);

// Verification request fails after a good response; no success until verified.
t=setup(); const real=t.options.request;
t.service.request=async(path,opts)=>{if(path.includes('&id=eq.'))throw Error('Readback offline');return real(path,opts);};
assert.equal((await t.service.submit(row,{confirmed:true})).state,'uncertain');
t.service.request=real;
assert.equal((await t.service.reconcile()).state,'verified');
assert.equal(t.records.length,1);

// Timeout before POST and during POST. A timeout can never trigger another insert.
t=setup({timeoutMs:5,request:()=>new Promise(()=>{})});
assert.equal((await t.service.submit(row,{confirmed:true})).state,'failed');
t=setup({timeoutMs:5});
t.service.request=async(path,opts)=> opts.method==='POST' ? new Promise(()=>{}) : [];
assert.equal((await t.service.submit(row,{confirmed:true})).state,'uncertain');

// Same-instance double clicks are serialized.
t=setup(); const both=await Promise.all([t.service.submit(row,{confirmed:true}),t.service.submit(row,{confirmed:true})]);
assert.ok(both.some(r=>r.state==='saving')); assert.equal(t.records.length,1);

class Storage {
  data=new Map(); get length(){return this.data.size;} key(i){return [...this.data.keys()][i];}
  getItem(k){return this.data.get(k)??null;} setItem(k,v){this.data.set(k,v);} removeItem(k){this.data.delete(k);}
}
const storage=new Storage();
const context={userId:'caregiver',groupId:'group',practice:false};
const a=new CheckinRecoveryStore(storage,context,'tab-a');
const b=new CheckinRecoveryStore(storage,context,'tab-b');
a.save({draft:{data:{0:{entry_date:row.date,answer:'A'}}}});
b.save({draft:{data:{0:{entry_date:'2026-10-01',answer:'B'}}}});
assert.equal(a.list().length,2);
assert.equal(new CheckinRecoveryStore(storage,{...context,userId:'other'},'tab').list().length,0);
assert.equal(new CheckinRecoveryStore(storage,{...context,groupId:'other'},'tab').list().length,0);
assert.equal(new CheckinRecoveryStore(storage,{...context,practice:true},'tab').list().length,0);
a.complete({recordId:'saved'});assert.equal(b.list().length,1);
assert.equal(b.list()[0].draft.data[0].answer,'B');
const broken=new CheckinRecoveryStore({setItem(){throw Error('full');}},context,'tab');
assert.throws(()=>broken.save({draft:{}}),/full/);
const silent=new CheckinRecoveryStore({setItem(){},getItem(){return null;}},context,'tab');
assert.throws(()=>silent.save({draft:{}}),/verified/);
console.log('Submission verification, backdates, duplicates, uncertainty, auth, storage and recovery: PASS');

// Verified recovery retires only matching pending-attempt copies, not other work.
const source=new CheckinRecoveryStore(storage,context,'source');
const fork=new CheckinRecoveryStore(storage,context,'fork');
source.save({attempt:{sent:true,row:{id:'shared-attempt'}},draft:{data:{0:{answer:'same pending attempt'}}}});
fork.save({attempt:{sent:true,row:{id:'shared-attempt'}},draft:{data:{0:{answer:'same pending attempt'}}}});
fork.complete({recordId:'shared-attempt'});
assert.ok(!source.list().some(item=>item.attempt?.row?.id==='shared-attempt'));
assert.equal(source.list()[0].draft.data[0].answer,'B');
console.log('Verified recovery cleanup preserves unrelated drafts: PASS');
