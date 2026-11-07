import assert from 'node:assert/strict';
import { scopeUvmReportRows } from './uvm-report-scope.js';
const url = 'https://rjozzwmkvlndanoaghtc.supabase.co';
const group = 'c40d0ac1-0122-46f6-b358-fac283287bb5';
const jamie = '58d3ac51-3dc7-4ead-b22f-8cb5829a3bac';
const rows = [
  {id:'jamie',payload:{individual_id:jamie}},
  {id:'plain-name',payload:{individual_name:'Jamie Rivers'}},
  {id:'legacy',payload:{individual_name:'Jamie Rivers — FICTIONAL'}},
  {id:'taylor',payload:{individual_id:'490dbc4d-7fa6-40f0-a2c1-c0fa0d33a868',individual_name:'Jamie Rivers — FICTIONAL'}},
  {id:'morgan',payload:{individual_id:'3dd695ac-9f51-496f-94ed-a306f4908b89'}},
  {id:'unknown',payload:{}}
];
assert.deepEqual(scopeUvmReportRows(rows,url,group).map(x=>x.id),['jamie','plain-name','legacy']);
assert.equal(scopeUvmReportRows(rows,'https://other-project.supabase.co',group),rows);
assert.equal(scopeUvmReportRows(rows,url,'other-group'),rows);
console.log('Jamie report isolation: explicit identity, legacy records, other people and unknown records PASS');

const scoped=scopeUvmReportRows(rows,url,group);
assert.ok(scoped.every(row=>row.payload.individual_id===jamie && row.individual_id===jamie));
assert.equal(rows[1].payload.individual_id,undefined,'original legacy record stays unchanged');
