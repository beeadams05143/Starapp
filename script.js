// script.js
import { supabase } from './supabaseClient.js';

const GROUP_KEY = 'currentGroupId';

async function completeLogout() {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('supabase signOut failed', err);
  }

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
    const { data: { session } } = await supabase.auth.getSession();
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
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data?.user?.id || null;
}
/* =========================
   Auth link (navbar)
   ========================= */
async function updateAuthLink() {
  const link = document.getElementById('auth-link'); // <a id="auth-link"> in navbar
  if (!link) return;

  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    // Logged in → show Log Out
    link.textContent = 'Log Out';
    link.href = '#';
    link.onclick = async (e) => {
      e.preventDefault();
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('signOut error', err);
      }
      // Route wherever you prefer after logout:
      window.location.href = 'login.html'; // or 'dashboard.html'
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
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return null;

  const { data: groupsNow } = await supabase.from('groups').select('id,name').limit(1);
  if (groupsNow?.length) return groupsNow[0];

  const { data, error } = await supabase
    .from('groups')
    .insert([{ name: 'Family' }])
    .select('id,name')
    .single();

  if (error) {
    console.warn('Could not auto-create default group:', error);
    return null;
  }
  return data;
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
  const { data: groups, error } = await supabase
    .from('groups')
    .select('id,name')
    .eq('archived', false)              // ✅ show only active groups
    .order('name', { ascending: true });

  if (!error) list = groups || [];
  else console.error('loadGroupsIntoSwitcher error', error);

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

  const { data, error } = await supabase
    .from('mood_entries')
    .select('*')
    .eq('group_id', gid)
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching entries:', error.message);
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

    const { error } = await supabase
      .from('mood_entries')
      .insert([{ date: today, mood: selectedMood, intensity, notes: note, user_id: userId, group_id: groupId }]);

      if (error) {
        console.error('Supabase insert error:', error);
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

      const { error } = await supabase.from('caregiver_checkins').insert([supaData]);
      if (error) {
        console.error('Caregiver insert error:', error);
        alert('Error saving caregiver check-in.');
      } else {
        alert('Caregiver check-in saved!');
        caregiverForm.reset();
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

/* =========================
   GROUP CHAT — status + realtime
   ========================= */

// Only run chat code on pages that have these:
const CHAT_BOX   = document.getElementById('chat-box');
const CHAT_INPUT = document.getElementById('chat-input');
const SEND_BTN   = document.getElementById('send-btn');

if (CHAT_BOX && CHAT_INPUT && SEND_BTN) {
  const el = (id) => document.getElementById(id);
  const setConnectionStatus = (m='') => { const n=el('status-connection'); if(n) n.textContent = m; };
  const setTypingStatus     = (m='') => { const n=el('status-typing');     if(n) n.textContent = m; };
  const setSendStatus       = (m='') => { const n=el('status-send');       if(n) n.textContent = m; };
  const setContextNote      = (m='') => { const n=el('status-context');    if(n) n.textContent = m; };
  const setReadStatus       = (m='') => { const n=el('status-read');       if(n) n.textContent = m; };
  window.setStatus = (m='') => setSendStatus(m); // back-compat

  let currentGroupId = null;
  let dbChannel = null;
  let typingChannel = null;
  let typingTimer = null;

  (async function bootChat(){
    setConnectionStatus('🔌 Connecting…');
    setContextNote('📅 Showing messages from the last 24 hours');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setConnectionStatus('⚠️ Please log in to chat'); return; }

    // Ensure the user has a profile row (id = auth user id)
    const defaultName =
      session?.user?.user_metadata?.full_name ||
      session?.user?.email?.split('@')[0] ||
      'User';

    await supabase.from('profiles').upsert(
      {
        id: session.user.id, // profiles PK = auth user id
        display_name: defaultName,
        avatar_url: session?.user?.user_metadata?.avatar_url || null
      },
      { onConflict: 'id' }   // important: conflict on id
    );

    currentGroupId = await resolveInitialGroupId(session.user.id);
    if (!currentGroupId) {
      setConnectionStatus('⚠️ You are not a member of any groups yet');
      return;
    }

    await loadMessages24h();
    await subscribeMessages();
    await setupTypingChannel();

    SEND_BTN.addEventListener('click', onSend);
    CHAT_INPUT.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) onSend(e); });
    CHAT_INPUT.addEventListener('input', broadcastTyping);

    const sel = document.getElementById('groupSelect');
    if (sel) {
      sel.addEventListener('change', async () => {
        currentGroupId = sel.value;
        await loadMessages24h();
        await subscribeMessages();
        await setupTypingChannel();
      });
    }
  })().catch(console.error);

  // Profile-first resolver
  async function resolveInitialGroupId(userId){
    // 1) profile-first
    const { data: p } = await supabase
      .from('profiles')
      .select('group_id')
      .eq('id', userId)
      .maybeSingle();

    if (p?.group_id) {
      localStorage.setItem(GROUP_KEY, p.group_id);
      return p.group_id;
    }

    // 2) fallback: cached
    const cached = localStorage.getItem(GROUP_KEY);
    if (cached) return cached;

    // 3) last resort: first membership
    const { data } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })
      .limit(1);

    return data?.[0]?.group_id || null;
  }

  function groupName(){
    const sel = document.getElementById('groupSelect');
    return sel?.selectedOptions?.[0]?.textContent || 'group';
  }

  function renderMsg(row){
    const div = document.createElement('div');
    div.className = 'chat-row';
    const time = new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const safe = String(row.message || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
    div.innerHTML = `<strong>user_${(row.user_id||'').slice(0,6)}</strong> <small>${time}</small><div>${safe}</div>`;
    CHAT_BOX.appendChild(div);
  }

  async function loadMessages24h(){
    if (!currentGroupId) return;

    const since = new Date(Date.now() - 24*60*60*1000).toISOString();
    const { data, error } = await supabase
      .from('group_chat')
      .select('id, user_id, message, created_at')
      .eq('group_id', currentGroupId)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) { console.error(error); setConnectionStatus('⚠️ Failed to load messages'); return; }

    CHAT_BOX.innerHTML = '';
    (data || []).forEach(renderMsg);
    CHAT_BOX.scrollTop = CHAT_BOX.scrollHeight;

    if (data && data.length) {
      await markMessageRead(data[data.length - 1].id).catch(()=>{});
      await updateReadStatusForLatest().catch(()=>{});
    }
  }

  async function markMessageRead(messageId){
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const payload = { message_id: messageId, user_id: session.user.id };
    const { error } = await supabase
      .from('group_chat_reads')
      .upsert(payload, { onConflict: 'message_id,user_id' });
    if (error) console.error('read upsert error', error);
  }

  async function updateReadStatusForLatest() {
    if (!currentGroupId) return;

    const { data: last, error: lastErr } = await supabase
      .from('group_chat')
      .select('id')
      .eq('group_id', currentGroupId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastErr) { console.error('latest message fetch error', lastErr); setReadStatus(''); return; }
    if (!last) { setReadStatus(''); return; }

    const [{ data: members, error: memErr }, { data: reads, error: readErr }] = await Promise.all([
      supabase.from('group_members').select('user_id').eq('group_id', currentGroupId),
      supabase.from('group_chat_reads').select('user_id').eq('message_id', last.id)
    ]);
    if (memErr || readErr) { console.error(memErr || readErr); return; }

    const total   = (members || []).length;
    const readers = new Set((reads || []).map(r => r.user_id));

    if (total > 0 && readers.size >= total) {
      setReadStatus('👀 All members have read the latest message');
    } else if (total > 0) {
      setReadStatus(`👀 Read by ${readers.size}/${total}`);
    } else {
      setReadStatus('');
    }
  }

  async function subscribeMessages(){
    if (dbChannel) supabase.removeChannel(dbChannel);

    dbChannel = supabase
      .channel(`gc:${currentGroupId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'group_chat',
        filter: `group_id=eq.${currentGroupId}`
      }, async (payload) => {
        renderMsg(payload.new);
        CHAT_BOX.scrollTop = CHAT_BOX.scrollHeight;
        await markMessageRead(payload.new.id).catch(()=>{});
        await updateReadStatusForLatest().catch(()=>{});
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED')   setConnectionStatus(`✅ Connected to ${groupName()}`);
        if (status === 'CHANNEL_ERROR') setConnectionStatus('⚠️ Connection error (retrying)…');
        if (status === 'TIMED_OUT')    setConnectionStatus('⏳ Connection timed out (retrying)…');
        if (status === 'CLOSED')       setConnectionStatus('🔌 Disconnected');
      });
  }

  async function setupTypingChannel(){
    if (typingChannel) supabase.removeChannel(typingChannel);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    typingChannel = supabase.channel(`typing:${currentGroupId}`);
    typingChannel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const { userId: other, isTyping, name } = payload || {};
      if (!other || other === userId) return;
      setTypingStatus(isTyping ? `💬 ${name || 'Someone'} is typing…` : '');
      if (isTyping) setTimeout(() => setTypingStatus(''), 1200);
    });
    await typingChannel.subscribe();
  }

  async function broadcastTyping(){
    const { data: { session } } = await supabase.auth.getSession();
    const name = session?.user?.email?.split('@')[0] || 'User';
    typingChannel?.send({ type:'broadcast', event:'typing', payload: { userId: session.user.id, name, isTyping: true }});
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      typingChannel?.send({ type:'broadcast', event:'typing', payload: { userId: session.user.id, name, isTyping: false }});
    }, 900);
  }

  async function onSend(e){
    e?.preventDefault?.();
    const text = (CHAT_INPUT.value || '').trim();
    if (!text || !currentGroupId) { setSendStatus('Pick a group first'); return; }

    setSendStatus('📤 Sending…');
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from('group_chat').insert({
      group_id: currentGroupId,
      user_id: session.user.id,
      message: text
    });
    if (error) { console.error(error); setSendStatus('❌ Failed to send'); return; }
    CHAT_INPUT.value = '';
    setSendStatus('✅ Sent');
    setTimeout(() => setSendStatus(''), 800);
  }
}
const caregiverForm = document.getElementById('caregiverForm');
if (caregiverForm) {
  caregiverForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 1. Get the current user
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (error) {
  console.error('Insert failed:', error);
  alert('Save failed. Please try again.');
  return;
}

// ✅ success → clear UI
caregiverForm.reset();
document.querySelectorAll('.selected').forEach(b => b.classList.remove('selected'));
// (optional) re-sync any range readouts:
caregiverForm.querySelectorAll('input[type="range"]').forEach(r => {
  const out = caregiverForm.querySelector(`#${r.id}-value`);
  if (out) out.textContent = r.value;
});


    // 2. Fetch profile name fields
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('public_name, display_name, full_name')
      .eq('id', user.id)
      .maybeSingle();

    if (profErr) console.warn('Profile fetch error:', profErr);

    // 3. Build row from form fields
    const row = {
      user_id: user.id,
      caregiver_name: prof?.public_name || prof?.display_name || prof?.full_name || null,
      hygiene: document.querySelector('#hygieneCheckbox').checked,
      food_prep: document.querySelector('#foodPrepCheckbox').checked,
      cleanup: document.querySelector('#cleanupCheckbox').checked,
      vocational_time: parseInt(document.querySelector('#vocationalTime').value) || 0,
      community_time: parseInt(document.querySelector('#communityTime').value) || 0,
      new_skill_score: parseInt(document.querySelector('#newSkillScore').value) || 0,
      caregiver_notes: document.querySelector('#caregiverNotes').value,
      submitted_at: new Date().toISOString()
    };

    // 4. Insert into Supabase
    const { data: ins, error: insErr, status } = await supabase
      .from('caregiver_checkins')
      .insert(row)
      .select('*')
      .single();

    console.log('INSERT →', { status, ins, insErr });

    if (insErr) {
      alert('Insert error: ' + (insErr.message || JSON.stringify(insErr)));
    } else {
      alert('Saved!');
      caregiverForm.reset();
    }
  });
}
