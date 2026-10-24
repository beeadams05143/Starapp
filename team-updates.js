import { rest, getSessionFromStorage } from './restClient.js?v=2026.07.03A';
import { ensureActiveGroupId } from './active-group.js?v=2026.10.07A';

const $ = id => document.getElementById(id);
const state = { groupId: null, userId: null, admin: false, individualId: '', individuals: [], updates: [], editing: null };
const categories = {
  medication: 'Medication & Regimen Changes',
  learning: 'Learning & Skill Development',
  other: 'Other Important Updates'
};
const value = input => String(input ?? '').trim();
function errorMessage(err) {
  if (err?.status === 404 || /(?:relation|schema cache|star_team_updates)/i.test(err?.message || '')) {
    return 'Team Updates needs its Supabase database setup before records can be saved or displayed. Ask the administrator to apply sql/2026-10-24-star-team-updates.sql.';
  }
  return err?.message || 'Unable to load Team Updates.';
}
function status(message, bad = false) {
  const node = $('teamStatus');
  node.textContent = message || '';
  node.classList.toggle('is-error', !!bad);
}
function niceDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return value(v);
  return new Date(v + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}
function el(tag, className, content) {
  const out = document.createElement(tag);
  if (className) out.className = className;
  if (content !== undefined) out.textContent = content;
  return out;
}
function appendLabeled(parent, label, content) {
  const p = el('p', 'update-meta');
  const b = el('strong', '', label + ': ');
  p.append(b, document.createTextNode(content));
  parent.append(p);
}
function updateCategoryHelp() {
  const kind = $('updateCategory').value;
  const label = $('updateDetailsLabel');
  if (kind === 'medication') {
    label.textContent = 'What changed? Include medications, doses, planned times, and scheduled vs PRN instructions';
    $('updateDetails').placeholder = 'Document the plan as written, including each step and the authorized source. Actual PRN administrations stay in daily check-ins.';
  } else if (kind === 'learning') {
    label.textContent = 'Describe this individually established goal and what progress means';
    $('updateDetails').placeholder = 'Describe the goal, practice approach, and what caregivers should look for. No preset skills.';
  } else {
    label.textContent = 'Describe the important update or support approach';
    $('updateDetails').placeholder = 'What changed, when it takes effect, and what caregivers should know.';
  }
}
function setFormVisible(on) {
  $('updateFormCard').hidden = !on || !state.admin;
  $('newUpdateButton').hidden = on || !state.admin;
}
function resetForm() {
  state.editing = null;
  $('teamUpdateForm').reset();
  $('updateEffective').value = new Date().toLocaleDateString('en-CA');
  $('updateCategory').value = 'medication';
  $('updateStatus').value = 'active';
  $('updateClosedOn').value = '';
  $('closedOnWrap').hidden = true;
  $('updateIndividual').value = state.individualId;
  $('updateFormTitle').textContent = 'New Team Update';
  $('saveUpdate').textContent = 'Save update';
  updateCategoryHelp();
}
function showForm(record = null) {
  if (!state.admin) return;
  resetForm();
  if (record) {
    state.editing = record.id;
    $('updateFormTitle').textContent = 'Edit Team Update';
    $('saveUpdate').textContent = 'Save changes';
    $('updateCategory').value = record.category;
    $('updateTitle').value = record.title;
    $('updateDetails').value = record.details;
    $('updateSource').value = record.source_note || '';
    $('updateEffective').value = record.effective_date;
    $('updateIndividual').value = record.individual_id || '';
    $('updateStatus').value = record.status;
    $('updateClosedOn').value = record.closed_on || '';
    $('closedOnWrap').hidden = record.status !== 'closed';
    updateCategoryHelp();
  }
  setFormVisible(true);
  $('updateTitle').focus();
}
function populateIndividualSelectors() {
  for (const select of [$('teamIndividual'), $('updateIndividual')]) {
    select.replaceChildren();
    if (state.individuals.length === 1) {
      select.add(new Option(state.individuals[0] ? 'Individual ' + state.individuals[0] : 'Group records without an individual ID', state.individuals[0]));
    } else {
      for (const id of state.individuals) {
        select.add(new Option(id ? 'Individual ' + id : 'Records without an individual ID', id));
      }
    }
    select.value = state.individualId;
  }
  $('individualPickerWrap').hidden = state.individuals.length < 2;
  $('updateIndividualWrap').hidden = state.individuals.length < 2;
}
async function loadScope() {
  const session = getSessionFromStorage();
  if (!session?.user?.id) { window.location.replace('auth.html'); throw new Error('Sign in required.'); }
  state.userId = session.user.id;
  state.groupId = await ensureActiveGroupId(state.userId);
  if (!state.groupId) throw new Error('Choose a STAR group before opening Team Updates.');
  $('teamGroupName').textContent = localStorage.getItem('currentGroupName') || 'Current STAR group';
  const memberships = await rest('group_members?select=role&group_id=eq.' + encodeURIComponent(state.groupId) + '&user_id=eq.' + encodeURIComponent(state.userId) + '&limit=1');
  state.admin = memberships?.[0]?.role === 'admin';
  $('teamPermission').textContent = state.admin ? 'Administrator: you can create and edit updates.' : 'Read-only: only your group administrator can make changes.';
  $('newUpdateButton').hidden = !state.admin;
  const records = await rest('caregiver_checkins?select=individual_id&group_id=eq.' + encodeURIComponent(state.groupId) + '&limit=1000');
  state.individuals = [...new Set((records || []).map(row => value(row.individual_id)))].sort();
  if (!state.individuals.length) state.individuals = [''];
  state.individualId = state.individuals[0];
  if (records?.length >= 1000) status('Showing individual identifiers from the first 1,000 available check-ins; confirm the individual before saving.');
  populateIndividualSelectors();
}
async function loadUpdates() {
  const scope = await ensureActiveGroupId(state.userId);
  if (scope !== state.groupId) throw new Error('The active group changed. Reload Team Updates.');
  const query = 'star_team_updates?select=id,group_id,individual_id,category,title,details,source_note,effective_date,status,closed_on,created_by,updated_by,updated_at&group_id=eq.' +
    encodeURIComponent(state.groupId) + '&individual_id=eq.' + encodeURIComponent(state.individualId) +
    '&order=effective_date.desc,created_at.desc&limit=1000';
  const records = await rest(query);
  if ((records || []).length >= 1000) throw new Error('More than 1,000 Team Updates may exist. Contact the administrator before generating a complete letter.');
  state.updates = records || [];
  renderEntries();
}
function renderEntries() {
  for (const [kind, heading] of Object.entries(categories)) {
    const host = $('updates-' + kind);
    host.replaceChildren();
    const records = state.updates.filter(item => item.category === kind);
    if (!records.length) {
      host.append(el('p', 'muted', 'No updates entered for this individual.'));
      continue;
    }
    for (const item of records) {
      const card = el('article', 'update-entry');
      const top = el('div', 'entry-head');
      const titleWrap = el('div');
      titleWrap.append(el('h3', '', item.title), el('small', '', niceDate(item.effective_date) + (item.status === 'closed' ? ' · Closed' : ' · Active')));
      top.append(titleWrap);
      if (state.admin) {
        const btn = el('button', 'edit-update', 'Edit');
        btn.type='button';
        btn.addEventListener('click', () => showForm(item));
        top.append(btn);
      }
      card.append(top);
      const detail = el('p', 'update-details', item.details);
      card.append(detail);
      if (item.source_note) appendLabeled(card, 'Source / context', item.source_note);
      if (item.closed_on) appendLabeled(card, 'Closed effective', niceDate(item.closed_on));
      host.append(card);
    }
  }
}
async function save(event) {
  event.preventDefault();
  if (!state.admin) return;
  const scope = await ensureActiveGroupId(state.userId);
  if (scope !== state.groupId) { status('The group changed. Reload Team Updates before saving.',true); return; }
  const payload = {
    category: $('updateCategory').value,
    title: value($('updateTitle').value),
    details: value($('updateDetails').value),
    source_note: value($('updateSource').value),
    effective_date: $('updateEffective').value,
    status: $('updateStatus').value,
    closed_on: $('updateStatus').value === 'closed' ? $('updateClosedOn').value : null
  };
  if (!payload.title || !payload.details || !/^\d{4}-\d{2}-\d{2}$/.test(payload.effective_date)) {
    status('Please enter a title, description, and valid effective date.',true); return;
  }
  if (payload.status === 'closed' && (!payload.closed_on || payload.closed_on < payload.effective_date)) {
    status('Choose a closure date on or after the effective date.',true); return;
  }
  if (payload.details.length > 5000 || payload.title.length > 160 || payload.source_note.length > 500) {
    status('The title, details, or source note is too long.',true); return;
  }
  const button = $('saveUpdate');
  button.disabled=true;
  try {
    if (state.editing) {
      const existing = state.updates.find(item => item.id === state.editing);
      if (!existing || existing.individual_id !== state.individualId) throw new Error('This update is no longer in the selected individual scope.');
      await rest('star_team_updates?id=eq.' + encodeURIComponent(state.editing) + '&group_id=eq.' + encodeURIComponent(state.groupId),{
        method:'PATCH',body:JSON.stringify(payload),headers:{Prefer:'return=representation'},expectedUserId:state.userId
      });
    } else {
      await rest('star_team_updates',{method:'POST',body:JSON.stringify({...payload,group_id:state.groupId,individual_id:state.individualId}),
        headers:{Prefer:'return=representation'},expectedUserId:state.userId});
    }
    setFormVisible(false);
    await loadUpdates();
    status('Saved. This update will appear in monthly caregiver letters covering its effective date (ongoing learning goals also appear while active).');
  } catch(err) {
    status('Update not saved: ' + errorMessage(err),true);
  } finally {
    button.disabled=false;
  }
}
$('newUpdateButton').addEventListener('click',()=>showForm());
$('cancelUpdate').addEventListener('click',()=>setFormVisible(false));
$('updateCategory').addEventListener('change',updateCategoryHelp);
$('updateStatus').addEventListener('change',()=>{$('closedOnWrap').hidden=$('updateStatus').value!=='closed';});
$('teamUpdateForm').addEventListener('submit',save);
$('teamIndividual').addEventListener('change',async event=>{
  state.individualId=event.target.value;
  $('updateIndividual').value=state.individualId;
  setFormVisible(false);
  try {await loadUpdates();status('');}catch(err){status(errorMessage(err),true);}
});
async function boot() {
  try {await loadScope();await loadUpdates();status(state.admin?'Entries are included in the monthly caregiver letter.':'Entries are read-only. Ask your administrator to request a correction.');}
  catch(err){$('newUpdateButton').hidden=true;status(errorMessage(err),true);}
}
boot();
