// script.js — REST conversions
import {
  rest,
  getSessionFromStorage,
} from './restClient.js?v=2025.01.09E';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  clearSavedSession,
} from './supabaseClient.js?v=2025.01.09E';

const GROUP_KEY = 'currentGroupId';

async function completeLogout() {
  const session = getSessionFromStorage();
  try {
    if (session?.access_token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scope: 'global' }),
      });
    }
  } catch (err) {
    console.warn('logout failed', err);
  }

  clearSavedSession();
  try {
    localStorage.removeItem(GROUP_KEY);
    localStorage.removeItem('currentGroupName');
    localStorage.removeItem('user_id');
  } catch {}

  location.href = 'login.html';
}

window.logOut = () => completeLogout();

window.updateAuthLink = async function updateAuthLink() {
  const a = document.getElementById('auth-dash-link');
  if (!a) return;
  try {
    const session = getSessionFromStorage();
    if (session) {
      a.textContent = 'Log Out';
      a.href = '#logout';
      a.onclick = async (e) => {
        e.preventDefault();
        await completeLogout();
      };
    } else {
      a.textContent = 'Log In';
      a.href = 'login.html';
      a.onclick = null;
    }
  } catch {
    a.textContent = 'Log In';
    a.href = 'login.html';
    a.onclick = null;
  }
};

/* =========================
   Shared helpers
   ========================= */
const getCurrentGroupId = () => localStorage.getItem(GROUP_KEY) || null;

async function getCurrentUserId() {
  const session = getSessionFromStorage();
  return session?.user?.id || null;
}
/* =========================
   Auth link (navbar)
   ========================= */
async function updateAuthLink() {
  const link = document.getElementById('auth-link'); // <a id="auth-link"> in navbar
  if (!link) return;

  const session = getSessionFromStorage();

  if (session) {
    // Logged in → show Log Out
    link.textContent = 'Log Out';
    link.href = '#';
    link.onclick = async (e) => {
      e.preventDefault();
      await completeLogout();
    };
  } else {
    // Logged out → show Log In
    link.textContent = 'Log In';
    link.href = 'login.html';
    link.onclick = null;
  }
}


/* =========================
   Group switcher (navbar)
   ========================= */
async function ensureDefaultGroup() {
  const session = getSessionFromStorage();
  const userId = session?.user?.id;
  if (!userId) return null;

  try {
    const groupsNow = await rest('groups?select=id,name&limit=1');
    if (groupsNow?.length) return groupsNow[0];
  } catch (error) {
    console.warn('ensureDefaultGroup fetch error', error);
  }

  try {
    const rows = await rest('groups', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{ name: 'Family' }]),
    });
    const data = Array.isArray(rows) ? rows[0] : rows;
    return data || null;
  } catch (error) {
    console.warn('Could not auto-create default group:', error);
    return null;
  }
}

async function loadGroupsIntoSwitcher() {
  // The navbar should render a <select id="groupSelect">
  const sel =
    document.querySelector('#groupSelect') ||
    document.querySelector('#group-switcher') ||
    document.querySelector('select#group');
  if (!sel) return;

  sel.innerHTML = '<option>Loading…</option>';
  sel.disabled = true;

  let list = [];
  try {
    const groups = await rest('groups?select=id,name&archived=eq.false&order=name.asc');
    list = groups || [];
  } catch (error) {
    console.error('loadGroupsIntoSwitcher error', error);
  }

  if (list.length === 0) {
    const created = await ensureDefaultGroup();
    if (created) list = [created];
  }

  sel.innerHTML = '';
  if (list.length === 0) {
    sel.disabled = true;
    sel.innerHTML = '<option>(no groups)</option>';
    return;
  }

  for (const g of list) {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    sel.appendChild(opt);
  }

  const saved = localStorage.getItem(GROUP_KEY);
  const exists = list.some(g => g.id === saved);
  const useId = exists ? saved : list[0].id;

  sel.value = useId;
  localStorage.setItem(GROUP_KEY, useId);
  sel.disabled = false;

  sel.addEventListener('change', () => {
    localStorage.setItem(GROUP_KEY, sel.value);
    // chat + mood listeners will react on their own
  });
}
window.loadGroupsIntoSwitcher = loadGroupsIntoSwitcher;

/* =========================
   Mood entries (server load)
   ========================= */
async function loadEntriesFromSupabase() {
  const gid = getCurrentGroupId();
  if (!gid) return;

  let data = [];
  try {
    data = await rest([
      'mood_entries?select=*',
      `group_id=eq.${encodeURIComponent(gid)}`,
      'order=date.desc'
    ].join('&'));
  } catch (error) {
    console.error('Error fetching entries:', error?.message || error);
    return;
  }

  const entriesList = document.getElementById('entries');
  if (entriesList) {
    entriesList.innerHTML = '';
    (data || []).forEach(entry => {
      const li = document.createElement('li');
      li.textContent = `${entry.date} — Mood: ${entry.mood}, Intensity: ${entry.intensity}, Note: ${entry.notes || 'None'}`;
      entriesList.appendChild(li);
    });
  }
}

/* =========================
   DOM wiring for non-chat pages
   ========================= */
// Category navigation used on home.html
export function goToMoodPage(category) {
  try { sessionStorage.setItem('checkinCategory', category); } catch {}
  window.location.href =
    'moodchecker_with_other_moods.html?category=' + encodeURIComponent(category);
}

// expose to inline onclick handlers (keep ONLY this one line)
window.goToMoodPage = goToMoodPage;



window.addEventListener('DOMContentLoaded', () => {
  const logoutButtons = document.querySelectorAll('#logoutBtn, [data-logout], button[data-action="logout"]');
  logoutButtons.forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      completeLogout();
    });
  });

  // Always try to populate groups
  loadGroupsIntoSwitcher().then(() => {
    // Mood list refresh on page load if present
    if (document.getElementById('entries')) loadEntriesFromSupabase();

    // Also refresh moods if group changes (chat reacts separately)
    const sel = document.getElementById('groupSelect');
    if (sel) sel.addEventListener('change', loadEntriesFromSupabase);
  });

   // call auth-link updater
  window.updateAuthLink?.();

  // --- Meeting Minutes: Attendees widget ---  👇 PASTE THIS WHOLE BLOCK HERE
  // --- Meeting Minutes: Attendees widget ---
(function setupAttendeesWidget() {
  const attendeeInput  = document.getElementById('attendeeName');
  const addAttendeeBtn = document.getElementById('addAttendeeBtn');
  const attendeesList  = document.getElementById('attendeesList');
  const attendeesField = document.getElementById('attendeesField'); // hidden <textarea>

  // If we’re not on the minutes page, bail out quietly
  if (!attendeeInput || !addAttendeeBtn || !attendeesList || !attendeesField) return;

  const attendees = []; // [{name, role}]

  function parseLine(raw) {
    const parts = raw.split(/\s*—\s*|\s+-\s+|--/); // em-dash or hyphen
    const name = (parts[0] || '').trim();
    const role = (parts.slice(1).join(' ') || '').trim();
    return { name, role };
  }

  function render() {
    attendeesList.innerHTML = attendees.map((a, i) => `
      <span class="chip" data-i="${i}"
            style="display:inline-flex;align-items:center;gap:.4rem;margin:.25rem;padding:.35rem .6rem;border:1px solid #e5e7eb;border-radius:999px;background:#f8fafc;">
        <span>${a.name}${a.role ? ' — ' + a.role : ''}</span>
        <button type="button" class="x" aria-label="Remove"
                style="border:none;background:transparent;font-size:1rem;line-height:1;cursor:pointer;">×</button>
      </span>
    `).join('');

    // keep a submit-friendly value (one per line)
    attendeesField.value = attendees
      .map(a => a.role ? `${a.name} — ${a.role}` : a.name)
      .join('\n');
  }

  function addOne() {
    const raw = (attendeeInput.value || '').trim();
    if (!raw) return;
    const { name, role } = parseLine(raw);
    if (!name) return;
    attendees.push({ name, role });
    attendeeInput.value = '';
    attendeeInput.focus();
    render();
  }

  addAttendeeBtn.addEventListener('click', addOne);
  attendeeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addOne(); }
  });
  attendeesList.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip || !e.target.closest('.x')) return;
    const i = Number(chip.dataset.i);
    if (!Number.isNaN(i)) { attendees.splice(i, 1); render(); }
  });
})(); //  ← ends the widget only (does NOT close DOMContentLoaded)



  // ---- local mood filter bits (unchanged) ----
  const moodButtons     = document.querySelectorAll('.mood-btn');
  const entriesList     = document.getElementById('entries');
  const cheerSound      = document.getElementById('cheer-sound');
  const intensitySlider = document.getElementById('intensity');
  const intensityValue  = document.getElementById('intensity-value');
  const searchInput     = document.getElementById('search');
  const form            = document.getElementById('mood-form');
  const caregiverForm   = document.getElementById('caregiver-checkin');
  const moodTableBody   = document.querySelector('#moodTable tbody');

  let selectedMood = null;
  const moodEntriesLocal = JSON.parse(localStorage.getItem('moodEntries') || '[]');

  if (intensitySlider && intensityValue) {
    intensityValue.textContent = intensitySlider.value;
    intensitySlider.addEventListener('input', () => {
      intensityValue.textContent = intensitySlider.value;
    });
  }

  function renderEntriesLocal(entries) {
    if (!entriesList) return;
    entriesList.innerHTML = '';
    entries.forEach(entry => {
      const li = document.createElement('li');
      li.textContent = `${entry.time} — Mood: ${entry.mood}, Intensity: ${entry.intensity}, Note: ${entry.note || 'None'}`;
      entriesList.appendChild(li);
    });
  }

  if (entriesList) loadEntriesFromSupabase();

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const term = searchInput.value.toLowerCase();
      const filtered = moodEntriesLocal.filter(entry =>
        entry.mood.toLowerCase().includes(term) ||
        entry.note?.toLowerCase().includes(term) ||
        entry.time?.toLowerCase().includes(term)
      );
      renderEntriesLocal(filtered);
    });
  }

  moodButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      moodButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedMood = btn.getAttribute('data-value');
    });
  });

  if (form) {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!selectedMood) return alert('Please select a mood first.');

    const groupId = getCurrentGroupId();
    if (!groupId) return alert('No group selected.');

    const intensity = Number(intensitySlider.value);
    const note      = document.getElementById('note').value;
    const today     = new Date().toISOString().split('T')[0];

    const userId = await getCurrentUserId();
    if (!userId) return alert('User not logged in.');

    const entry = { mood: selectedMood, intensity, note, time: new Date().toLocaleString() };
    moodEntriesLocal.unshift(entry);
    localStorage.setItem('moodEntries', JSON.stringify(moodEntriesLocal));
    renderEntriesLocal(moodEntriesLocal);

    try {
      await rest('mood_entries', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([{ date: today, mood: selectedMood, intensity, notes: note, user_id: userId, group_id: groupId }]),
      });
    } catch (error) {
      console.error('Mood insert error:', error);
      alert('Error saving mood.');
      return;
    }

      cheerSound?.play();
      window.confetti?.({ particleCount: 100, spread: 70, origin: { y: 0.6 } });

      form.reset();
      moodButtons.forEach(b => b.classList.remove('selected'));
      selectedMood = null;

      loadEntriesFromSupabase();
    });
  }

 if (false && caregiverForm) {
  caregiverForm.addEventListener('submit', async e => {

      e.preventDefault();

      const groupId = getCurrentGroupId();
      if (!groupId) return alert('No group selected.');
      const userId = await getCurrentUserId();
      if (!userId) return alert('User not logged in.');

      const fd = new FormData(caregiverForm);
      const obj = {};
      fd.forEach((v, k) => { if (k !== 'mediaUpload') obj[k] = v; });
      const file = fd.get('mediaUpload');
      obj.mediaUpload = file?.name ? { name: file.name, type: file.type } : null;

      const today = new Date().toISOString().split('T')[0];

      const supaData = {
        group_id: groupId,
        user_id: userId,
        date: today,
        appears_in_good_health: obj.appearsInGoodHealth,
        appears_tired: obj.appearsTired,
        hours_of_sleep: obj.hoursOfSleep,
        prn_sleep_aid_given: obj.prnSleepAidGiven,
        prn_time_given: obj.prnTimeGiven,
        prn_for_anxiety: obj.prnForAnxiety,
        had_bm: obj.hadBM,
        appeared_manic: obj.appearedManic,
        trouble_focusing: obj.troubleFocusing,
        displayed_aggression: obj.displayedAggression,
        intensity: Number(obj.intensity || 0),
        vocational_activity: Number(obj.vocationalActivity || 0),
        vocational_time: Number(obj.vocationalTime || 0),
        community_activity: Number(obj.communityActivity || 0),
        community_time: Number(obj.communityTime || 0),
        engaged_with_community_member: obj.engagedWithCommunityMember,
        leisure_activity: Number(obj.leisureActivity || 0),
        community_vocational_notes: obj.communityVocationalNotes || '',
        hygiene_activity: obj.hygieneActivity,
        hygiene_note: obj.hygieneNote || '',
        hygiene_skill: Number(obj.hygieneSkill || 0),
        prepared_food: obj.preparedFood,
        food_prep_note: obj.foodPrepNote || '',
        food_prep_skill: Number(obj.foodPrepSkill || 0),
        cleanup_tasks: obj.cleanupTasks,
        cleanup_note: obj.cleanupNote || '',
        cleanup_skill: Number(obj.cleanupSkill || 0),
        caregiver_notes: obj.notes || '',
        media_upload: obj.mediaUpload || null
      };

      try {
        await rest('caregiver_checkins', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify([supaData]),
        });
        alert('Caregiver check-in saved!');
        caregiverForm.reset();
      } catch (error) {
        console.error('Caregiver insert error:', error);
        alert('Error saving caregiver check-in.');
      }
    });
  }
});

/* =========================
   PDF download helper
   ========================= */
window.downloadEntry = async function (index) {
  const data = JSON.parse(localStorage.getItem('caregiverEntries') || '[]');
  const entry = data[index];
  if (!entry) return;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  let y = 20;

  pdf.setFontSize(14);
  pdf.text('Caregiver Check-In', 20, y);
  y += 10;
  pdf.setFontSize(11);
  pdf.text(`Timestamp: ${entry.timestamp}`, 20, y);
  y += 10;

  for (const key in entry.data) {
    const val = key === 'mediaUpload' && typeof entry.data[key] === 'object' && entry.data[key]?.name
      ? `${entry.data[key].name} (${entry.data[key].type})`
      : entry.data[key];
    pdf.text(`${key}: ${val}`, 20, y);
    y += 8;
    if (y > 270) { pdf.addPage(); y = 20; }
  }

  pdf.save(`caregiver_checkin_${index + 1}.pdf`);
};

const caregiverForm = document.getElementById('caregiverForm');
if (caregiverForm) {
  caregiverForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const session = getSessionFromStorage();
    const user = session?.user;
    if (!user?.id) {
      alert('Save failed. Please log in.');
      return;
    }

    try {
      const profileRows = await rest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=public_name,display_name,full_name`);
      const prof = profileRows?.[0] || {};

      const caregiverNameInput = document.querySelector('#caregiver_name');
      const caregiverNameRaw = caregiverNameInput?.value?.trim() || '';
      const derivedName = prof.public_name || prof.display_name || prof.full_name || '';
      const caregiverName = caregiverNameRaw || derivedName || null;

      const row = {
        user_id: user.id,
        caregiver_name: caregiverName,
        hygiene: document.querySelector('#hygieneCheckbox')?.checked ?? false,
        food_prep: document.querySelector('#foodPrepCheckbox')?.checked ?? false,
        cleanup: document.querySelector('#cleanupCheckbox')?.checked ?? false,
        vocational_time: parseInt(document.querySelector('#vocationalTime')?.value, 10) || 0,
        community_time: parseInt(document.querySelector('#communityTime')?.value, 10) || 0,
        new_skill_score: parseInt(document.querySelector('#newSkillScore')?.value, 10) || 0,
        caregiver_notes: document.querySelector('#caregiverNotes')?.value || '',
        submitted_at: new Date().toISOString()
      };

      await rest('caregiver_checkins', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([row]),
      });

      alert('Saved!');
      caregiverForm.reset();
      document.querySelectorAll('.selected').forEach(b => b.classList.remove('selected'));
      caregiverForm.querySelectorAll('input[type="range"]').forEach(r => {
        const out = caregiverForm.querySelector(`#${r.id}-value`);
        if (out) out.textContent = r.value;
      });
    } catch (error) {
      console.error('Insert failed:', error);
      alert('Save failed. Please try again.');
    }
  });
}
