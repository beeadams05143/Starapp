// calendar.js — REST-based version
import { rest, getSessionFromStorage } from '../restClient.js?v=2025.01.09E';

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
async function requireUser() {
  const session = getSessionFromStorage();
  if (!session?.user?.id) {
    alert('Please log in to use the calendar.');
    throw new Error('No user');
  }
  me = session.user;
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
  try {
    const params = [
      'group_members?select=group_id,role,membership_role,groups!inner(id,name)',
      'role=in.(owner,admin)'
    ];
    const data = await rest(params.join('&'));

    // Remove duplicates by group_id
    const seen = new Set();
    (data || []).forEach(row => {
      if (!row?.groups?.id || seen.has(row.groups.id)) return;
      seen.add(row.groups.id);
      groupSelect.add(new Option(row.groups.name, row.groups.id));
    });
  } catch (error) {
    console.error('loadMyAdminGroups error', error);
  }
}

async function loadCalendars() {
  // Thanks to RLS, this will return calendars visible via group membership OR calendar_members.
  let data = [];
  try {
    data = await rest('calendars?select=id,name,group_id&order=created_at.asc');
  } catch (error) {
    console.error('loadCalendars error', error);
    return;
  }

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

  let cal = null;
  try {
    const rows = await rest('calendars', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{ name, group_id }]),
    });
    cal = Array.isArray(rows) ? rows[0] : rows;
    if (!cal) throw new Error('Calendar creation failed');
  } catch (error) {
    alert(error?.message || 'Could not create calendar.');
    return;
  }

  // If you keep personal calendars PLUS calendar_members,
  // make the creator the owner when no group is chosen.
  if (!group_id) {
    try {
      await rest('calendar_members', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([{ calendar_id: cal.id, user_id: me.id, role: 'owner' }]),
      });
    } catch (mErr) {
      alert(mErr?.message || 'Could not add calendar owner.');
      return;
    }
  }

  newCalName.value = '';
  await loadCalendars();
}

async function loadEvents(calendarId) {
  const now = new Date();
  const horizon = new Date();
  horizon.setDate(now.getDate() + 60);

  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  let data = [];
  try {
    const params = [
      'events?select=*',
      `calendar_id=eq.${encodeURIComponent(calendarId)}`,
      `starts_at=gte.${encodeURIComponent(since)}`,
      `starts_at=lte.${encodeURIComponent(horizon.toISOString())}`,
      'order=starts_at.asc'
    ];
    data = await rest(params.join('&'));
  } catch (error) {
    console.error('loadEvents error', error);
    return;
  }

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

  try {
    await rest('events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([{
        calendar_id: calendarId,
        title: titleEl.value,
        description: null,
        starts_at,
        ends_at,
        all_day: !!allDayEl.checked,
        location: (locEl.value || null),
        created_by: me.id
      }]),
    });
  } catch (error) {
    alert(error?.message || 'Could not create event.');
    return;
  }

  form.reset();
  await loadEvents(calendarId);
}

// --- Wire up
createCalBtn.addEventListener('click', createCalendar);
form.addEventListener('submit', addEvent);
calSelect.addEventListener('change', (e) => {
  const id = e.target.value;
  loadEvents(id);
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
