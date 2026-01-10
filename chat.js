// chat.js — hard-wired to Family group, REST version (polling-based)
// Requires: restClient.js exporting { rest, getSessionFromStorage }
// and <script type="module" src="chat.js"></script> in chat.html

import { rest, getSessionFromStorage } from './restClient.js?v=2025.01.09E';

// ---------- CONFIG ----------
const GROUP_ID = '3159dde9-8cf3-4a29-af72-01da907f241b'; // Family

// ---------- Require login ----------
const session = getSessionFromStorage();
if (!session?.user?.id || !session?.access_token) {
  const ret = encodeURIComponent('chat.html');
  window.location.href = `login.html?redirect=${ret}`;
  throw new Error('No session');
}
const currentUserId = session.user.id;

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
  const encodedIds = ids.map(id => encodeURIComponent(id)).join(',');
  try {
    const rows = await rest(
      `profiles?select=id,display_name,avatar_url&id=in.(${encodedIds})`
    );
    for (const p of rows || []) profiles.set(p.id, p);
  } catch (error) {
    console.error('profiles load error', error);
  }
}

// ---------- read receipts ----------
async function fetchReadsFor(messageIds, myId) {
  if (!messageIds.length) return new Map();
  const encodedIds = messageIds.map(id => encodeURIComponent(id)).join(',');
  let data = [];
  try {
    data = await rest(
      `message_reads?select=message_id,user_id&message_id=in.(${encodedIds})`
    );
  } catch (error) {
    console.error('reads load error', error);
    return new Map();
  }
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
  try {
    await rest('message_reads', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    });
  } catch (error) {
    console.error('mark read error', error);
  }
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
  const myId = getSessionFromStorage()?.user?.id || currentUserId;

  let msgs = [];
  try {
    const path = [
      'messages?select=id,message,created_at,sender_id,group_id',
      `group_id=eq.${GROUP_ID}`,
      'order=created_at.asc',
      'order=id.asc'
    ].join('&');
    msgs = await rest(path);
  } catch (error) {
    console.error('load messages error', error);
    return;
  }

  await loadProfiles(msgs.map(m => m.sender_id));
  await markReadFor(msgs, myId);
  const reads = await fetchReadsFor(msgs.map(m => m.id), myId);
  render(msgs, myId, reads);
}

// ---------- send ----------
async function sendMessage() {
  const text = (input.value || '').trim();
  if (!text) return;

  const myId = getSessionFromStorage()?.user?.id || currentUserId;

  const row = {
    group_id: GROUP_ID,
    sender_id: myId,
    message: text,
    delivered_at: new Date().toISOString()
  };

  try {
    await rest('messages', {
      method: 'POST',
      body: JSON.stringify([row]),
      headers: { Prefer: 'return=minimal' },
    });
  } catch (error) {
    console.error('Insert error:', error);
    alert('Could not send message.');
    return;
  }

  input.value = '';
  await loadMessages();               // refresh *after* successful insert
}

// ---------- UI events ----------
sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

// Poll for updates (fallback while realtime client unavailable)
const pollId = setInterval(() => loadMessages().catch(() => {}), 5000);

// Clean up on page exit
window.addEventListener('beforeunload', () => {
  clearInterval(pollId);
});

// Initial load
await loadMessages();
