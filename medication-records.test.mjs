import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedMedication,editMedication,discontinueMedication,isDiscontinued,editDiscontinuedDetails} from './medication-records.mjs';

test('old records remain active, unchanged and readable',()=>{
 const original={name:'Sample',dosage:'10 mg',frequency:'AM',other:'kept'};
 const normalized=normalizedMedication(original);
 assert.equal(normalized.status,'active');
 assert.equal(normalized.other,'kept');
 assert.equal(original.status,undefined);
});
test('changed dose keeps its previous value, reason and date',()=>{
 const current=editMedication({name:'Sample',dosage:'10 mg',frequency:'AM'},
  {name:'Sample',dosage:'5 mg',frequency:'PM',date:'2026-10-25',reason:'New plan'});
 assert.equal(current.dosage,'5 mg');
 assert.equal(current.dose_history[0].previous_dosage,'10 mg');
 assert.equal(current.dose_history[0].date,'2026-10-25');
 assert.equal(current.dose_history[0].reason,'New plan');
});
test('discontinuation keeps history and reason without deleting',()=>{
 const changed=editMedication({name:'Sample',dosage:'10 mg',frequency:'AM'},
  {name:'Sample',dosage:'5 mg',frequency:'PM',date:'2026-10-24'});
 const stopped=discontinueMedication(changed,{date:'2026-10-25',reason:'Ineffective'});
 assert.equal(isDiscontinued(stopped),true);
 assert.equal(stopped.discontinued_reason,'Ineffective');
 assert.equal(stopped.dose_history.length,1);
 const corrected=editDiscontinuedDetails(stopped,{date:'2026-10-22',reason:'Adverse effect'});
 assert.equal(corrected.status,'discontinued');
 assert.equal(stopped.discontinued_on,'2026-10-25');
});
test('reject missing name/date and edits to discontinued meds',()=>{
 assert.throws(()=>discontinueMedication({name:'Test'}, {date:''}));
 assert.throws(()=>editMedication({name:'Test',dosage:'10 mg'}, {name:'Test',dosage:'20 mg',date:''}));
 const stopped=discontinueMedication({name:'Test'},{date:'2026-10-25'});
 assert.throws(()=>editMedication(stopped,{name:'Test',dosage:'5 mg',date:'2026-10-25'}));
});
