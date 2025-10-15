// calendar.js
import { supabase } from '../supabaseClient.js?v=2025.10.15d';

const calList = document.getElementById('calList');
const calSelect = document.getElementById('calendarSelect');

const newCalName = document.getElementById('newCalName');
const createCalBtn = document.getElementById('createCalBtn');
const groupSelect = document.getElementById('groupSelect');

const form = document.getElementById('eventForm');
const titleEl = document.getElementById('title');
const dateEl = document.getElementById('date');
const startEl = document.getElementById('start');
const endEl = document.getElementById('end');
const locEl = document.getElementById('location');
const allDayEl = document.getElementById('all_day');
const eventList = document.getElementById('eventList');

let me = null;
let channel = null;

async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    alert('Please log in to use the calendar.');
    throw new Error('No user');
  }
  me = data.user;
}

function toUTC(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!timeStr) return new Date(Date.UTC(y, m - 1, d)).toISOString();
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh || 0, mm || 0)).toISOString();
}

async function loadMyAdminGroups() {
  // Your column may be enum "membership_role" stored in 'role'.
  // Select both names to be safe; use whichever exists in the row.
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, role, membership_role, groups!inner(id, name)')
    .in('role', ['owner','admin']); // Works when the column is named 'role' (enum)
  // If your column name is not 'role', the filter will be ignored silently; we’ll still render groups.
  if (error) { console.error(error); return; }

  // Remove duplicates by group_id
  const seen = new Set();
  (data || []).forEach(row => {
    if (seen.has(row.groups.id)) return;
    seen.add(row.groups.id);
    groupSelect.add(new Option(row.groups.name, row.groups.id));
  });
}

async function loadCalendars() {
  // Thanks to RLS, this will return calendars visible via group membership OR calendar_members.
  const { data, error } = await supabase
    .from('calendars')
    .select('id, name, group_id')
    .order('created_at', { ascending: true });

  if (error) { console.error(error); return; }

  calList.innerHTML = '';
  calSelect.innerHTML = '';

  (data || []).forEach(c => {
    const li = document.createElement('li');
    li.textContent = c.name;
    if (c.group_id) {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = 'group';
      li.appendChild(b);
    } else {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = 'personal';
      li.appendChild(b);
    }
    calList.appendChild(li);
    calSelect.add(new Option(c.name, c.id));
  });

  if (calSelect.value) {
    await loadEvents(calSelect.value);
    subscribeToCalendar(calSelect.value);
  }
}

async function createCalendar() {
  const name = (newCalName.value || '').trim();
  if (!name) return alert('Name required');

  const group_id = groupSelect.value || null;

  const { data: cal, error } = await supabase
    .from('calendars')
    .insert({ name, group_id })
    .select()
    .single();
  if (error) { alert(error.message); return; }

  // If you keep personal calendars PLUS calendar_members,
  // make the creator the owner when no group is chosen.
  if (!group_id) {
    const { error: mErr } = await supabase
      .from('calendar_members')
      .insert({ calendar_id: cal.id, user_id: me.id, role: 'owner' });
    if (mErr) { alert(mErr.message); return; }
  }

  newCalName.value = '';
  await loadCalendars();
}

async function loadEvents(calendarId) {
  const now = new Date();
  const horizon = new Date();
  horizon.setDate(now.getDate() + 60);

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('calendar_id', calendarId)
    .gte('starts_at', new Date(now.getTime() - 24*60*60*1000).toISOString()) // show yesterday onward
    .lte('starts_at', horizon.toISOString())
    .order('starts_at', { ascending: true });

  if (error) { console.error(error); return; }

  eventList.innerHTML = '';
  (data || []).forEach(ev => {
    const li = document.createElement('li');
    const start = new Date(ev.starts_at).toLocaleString();
    const end = new Date(ev.ends_at).toLocaleString();
    li.textContent = `${start} — ${end}: ${ev.title}${ev.location ? ' @ ' + ev.location : ''}`;
    eventList.appendChild(li);
  });
}

async function addEvent(e) {
  e.preventDefault();
  const calendarId = calSelect.value;
  if (!calendarId) return alert('Select a calendar first');

  const date = dateEl.value;
  if (!date) return alert('Pick a date');

  const starts_at = allDayEl.checked ? toUTC(date, null) : toUTC(date, startEl.value);
  const ends_at   = allDayEl.checked ? toUTC(date, null) : toUTC(date, endEl.value || startEl.value);

  const { error } = await supabase.from('events').insert({
    calendar_id: calendarId,
    title: titleEl.value,
    description: null,
    starts_at,
    ends_at,
    all_day: !!allDayEl.checked,
    location: (locEl.value || null),
    created_by: me.id
  });
  if (error) { alert(error.message); return; }

  form.reset();
  await loadEvents(calendarId);
}

// --- Realtime (optional but nice)
function subscribeToCalendar(calendarId) {
  if (channel) supabase.removeChannel(channel);
  channel = supabase
    .channel(`events-${calendarId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'events', filter: `calendar_id=eq.${calendarId}` },
      () => loadEvents(calendarId)
    )
    .subscribe();
}

// --- Wire up
createCalBtn.addEventListener('click', createCalendar);
form.addEventListener('submit', addEvent);
calSelect.addEventListener('change', (e) => {
  const id = e.target.value;
  loadEvents(id);
  subscribeToCalendar(id);
});

(async function init() {
  try {
    await requireUser();
    await loadMyAdminGroups();   // fills the Group dropdown with groups you admin/own
    await loadCalendars();       // lists calendars user can see (via Groups or calendar_members)
  } catch (e) {
    console.error(e);
  }
})();
document.querySelector(".cal-nav.prev").onclick = async () => {
  state.month--; if (state.month < 0) { state.month = 11; state.year--; }
  await renderMonth(); renderSelected();
};
document.querySelector(".cal-nav.next").onclick = async () => {
  state.month++; if (state.month > 11) { state.month = 0; state.year++; }
  await renderMonth(); renderSelected();
};
