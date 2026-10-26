// STAR: medication history model; older entries remain active.
export const normalizedMedication = m => ({...(m||{}), name:String(m?.name||''), dosage:String(m?.dosage||''), frequency:String(m?.frequency||''), status:m?.status==='discontinued'?'discontinued':'active', dose_history:Array.isArray(m?.dose_history)?m.dose_history:[]});
export const isDiscontinued = m => normalizedMedication(m).status==='discontinued';
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s||'');
export function editMedication(m, {name,dosage,frequency,date,reason=''}) {
  const old=normalizedMedication(m);
  if(old.status==='discontinued') throw Error('Medication already discontinued.');
  name=String(name||'').trim();
  if(!name) throw Error('Enter the medication name.');
  dosage=String(dosage||'').trim(); frequency=String(frequency||'').trim();
  const changed=dosage!==old.dosage||frequency!==old.frequency;
  if(changed&&!validDate(date)) throw Error('Choose a date for this change.');
  const history=changed?[...old.dose_history,{date,previous_dosage:old.dosage,previous_frequency:old.frequency,new_dosage:dosage,new_frequency:frequency,reason:String(reason||'').trim()}]:old.dose_history;
  return {...old,name,dosage,frequency,dose_history:history};
}
export function discontinueMedication(m,{date,reason=''}) {
  const old=normalizedMedication(m);
  if(old.status==='discontinued') throw Error('Already discontinued.');
  if(!validDate(date)) throw Error('Choose a discontinuation date.');
  return {...old,status:'discontinued',discontinued_on:date,discontinued_reason:String(reason||'').trim()};
}
export function editDiscontinuedDetails(m,{date,reason=''}) {
  const old=normalizedMedication(m);
  if(old.status!=='discontinued') throw Error('Medication is still active.');
  if(!validDate(date)) throw Error('Choose a discontinuation date.');
  return {...old,discontinued_on:date,discontinued_reason:String(reason||'').trim()};
}
