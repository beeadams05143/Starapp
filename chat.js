// chat.js — hard-wired to Family group, realtime-ready
// Requires: supabaseClient.js in same folder exporting { supabase }
// and <script type="module" src="chat.js"></script> in chat.html

import { supabase } from './supabaseClient.js?v=2025.10.15c';

// ---------- CONFIG ----------
const GROUP_ID = '3159dde9-8cf3-4a29-af72-01da907f241b'; // Family

// ---------- Require login ----------
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  const ret = encodeURIComponent('chat.html');
  window.location.href = `login.html?redirect=${ret}`;
  throw new Error('No session');
}

// ---------- DOM refs ----------
const chatBox = document.getElementById('chatBox');
const input   = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

// ---------- utils ----------
const escapeHTML = (s) =>
  (s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime = (ts) => new Date(ts).toLocaleString();

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstChild;
}

// ---------- profiles cache ----------
const profiles = new Map();
async function loadProfiles(userIds) {
  const ids = [...new Set(userIds)].filter(Boolean).filter(id => !profiles.has(id));
  if (!ids.length) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', ids);
  if (error) { console.error('profiles load error', error); return; }
  for (const p of data) profiles.set(p.id, p);
}

// ---------- read receipts ----------
async function fetchReadsFor(messageIds, myId) {
  if (!messageIds.length) return new Map();
  const { data, error } = await supabase
    .from('message_reads')
    .select('message_id, user_id')
    .in('message_id', messageIds);
  if (error) { console.error('reads load error', error); return new Map(); }
  const map = new Map();
  for (const r of data) {
    if (r.user_id === myId) continue;          // only count others' reads
    map.set(r.message_id, (map.get(r.message_id) || 0) + 1);
  }
  return map;
}

async function markReadFor(messages, myId) {
  const rows = messages
    .filter(m => m.sender_id !== myId)
    .map(m => ({ message_id: m.id, user_id: myId }));
  if (!rows.length) return;
  const { error } = await supabase
    .from('message_reads')
    .upsert(rows, { onConflict: 'message_id,user_id' });
  if (error) console.error('mark read error', error);
}

// ---------- render ----------
function render(messages, myId, readsByMsgId) {
  chatBox.innerHTML = '';
  for (const m of messages) {
    const p = profiles.get(m.sender_id) || {};
    const isMine = (m.sender_id === myId);
    const othersRead = (readsByMsgId.get(m.id) || 0) > 0;
    const ticks = isMine ? (othersRead ? '✓✓' : '✓') : '';

    const displayName = p.display_name || (isMine ? 'You' : 'Someone');
    const avatarUrl   = p.avatar_url   || 'https://placehold.co/36x36';

    const node = el(`
      <div class="bubble">
        <img class="avatar" src="${escapeHTML(avatarUrl)}" onerror="this.style.display='none'">
        <div class="content">
          <div><strong>${escapeHTML(displayName)}</strong></div>
          <div class="msg">${escapeHTML(m.message || '')}</div>
          <div class="meta">${fmtTime(m.created_at)} ${isMine ? `<span>${ticks}</span>` : ''}</div>
        </div>
      </div>
    `);
    chatBox.appendChild(node);
  }
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ---------- data load ----------
async function loadMessages() {
  const { data: auth } = await supabase.auth.getUser();
  const myId = auth?.user?.id;

  const { data: msgs, error } = await supabase
    .from('messages')
    .select('id, message, created_at, sender_id, group_id')
    .eq('group_id', GROUP_ID)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) { console.error('load messages error', error); return; }

  await loadProfiles(msgs.map(m => m.sender_id));
  await markReadFor(msgs, myId);
  const reads = await fetchReadsFor(msgs.map(m => m.id), myId);
  render(msgs, myId, reads);
}

// ---------- send ----------
async function sendMessage() {
  const text = (input.value || '').trim();
  if (!text) return;

  const { data: auth } = await supabase.auth.getUser();
  const myId = auth?.user?.id;

  const row = {
    group_id: GROUP_ID,
    sender_id: myId,
    message: text,
    delivered_at: new Date().toISOString()
  };

  const { error } = await supabase.from('messages').insert([row]);
  if (error) {
    console.error('Insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      row
    });
    alert('Could not send message.');
    return;
  }

  input.value = '';
  await loadMessages();               // refresh *after* successful insert
}

// ---------- UI events ----------
sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

// ---------- realtime subscriptions ----------
const msgSub = supabase
  .channel('messages:changes')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `group_id=eq.${GROUP_ID}`
  }, async () => {
    await loadMessages();
  })
  .subscribe((status) => console.log('[realtime:messages] status:', status));

const readSub = supabase
  .channel('reads:inserts')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'message_reads'
  }, async () => {
    await loadMessages();
  })
  .subscribe((status) => console.log('[realtime:reads] status:', status));

// Optional: belt-and-suspenders polling until realtime confirmed
const pollId = setInterval(() => loadMessages().catch(() => {}), 5000);

// Clean up on page exit
window.addEventListener('beforeunload', () => {
  clearInterval(pollId);
  supabase.removeChannel(msgSub);
  supabase.removeChannel(readSub);
});

// Initial load
await loadMessages();
