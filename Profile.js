// Profile.js — vanilla browser version (no React)
import { supabase } from './supabaseClient.js?v=2025.10.15f';
import { setupAvatarUpload } from './src/components/AvatarUpload.js?v=2025.10.15f';

document.addEventListener('DOMContentLoaded', async () => {
  // Require session
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert('Please log in first.');
    location.href = './login.html';
    return;
  }
  const user = session.user;

  // Build basic UI if not present
  const root = document.querySelector('#profileRoot') || (() => {
    const d = document.createElement('div');
    d.id = 'profileRoot';
    d.style.maxWidth = '640px';
    d.style.margin = '0 auto';
    d.style.padding = '1rem';
    document.body.appendChild(d);
    return d;
  })();

  root.innerHTML = `
    <h1>Profile</h1>
    <p id="signedInAs" style="opacity:0.7;margin-top:-8px">Signed in as ${user.email ?? ''}</p>

    <div style="margin:16px 0;padding:12px;border:1px solid #eee;border-radius:12px">
      <label for="displayName" style="font-weight:600">Display name</label>
      <input id="displayName" placeholder="Your name"
        style="width:100%;margin-top:8px;padding:10px 12px;border-radius:10px;border:1px solid #ddd" />
      <button id="saveProfileBtn"
        style="margin-top:12px;padding:10px 14px;border-radius:10px;border:none;background:#4f46e5;color:#fff;cursor:pointer">
        Save
      </button>
      <div id="profileMsg" style="margin-top:8px"></div>
    </div>

    <div id="avatarCard" style="margin:16px 0;padding:12px;border:1px solid #eee;border-radius:12px">
      <div style="display:flex;gap:16px;align-items:center;">
        <img id="avatarImg" src="./IMG/default-avatar.png" alt="Avatar" width="96" height="96"
             style="border-radius:50%;object-fit:cover;border:1px solid #ddd;">
        <div>
          <input id="avatarInput" type="file" accept="image/*" />
          <div id="avatarMsg" style="margin-top:8px;font-size:0.9rem;opacity:0.8;"></div>
        </div>
      </div>
    </div>
  `;

  const displayNameEl = document.getElementById('displayName');
  const saveBtn       = document.getElementById('saveProfileBtn');
  const profileMsg    = document.getElementById('profileMsg');

  // Load profile row (create one if missing)
  try {
    const { data: row, error } = await supabase
      .from('profiles')
      .select('full_name, public_name, display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error; // ignore "no rows" code

    const metaName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email;

    if (!row) {
      // create minimal row
      const { error: upErr } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: metaName,
        public_name: metaName,
        display_name: metaName,
      });
      if (upErr) throw upErr;
      displayNameEl.value = metaName;
    } else {
      displayNameEl.value = row.public_name || row.display_name || row.full_name || metaName;
      if (row.avatar_url) {
        const img = document.getElementById('avatarImg');
        if (img) img.src = row.avatar_url;
      }
    }
  } catch (e) {
    console.error('Load profile error:', e);
    profileMsg.style.color = 'crimson';
    profileMsg.textContent = `Load error: ${e.message || e}`;
  }

  // Save display name
  saveBtn.addEventListener('click', async () => {
    const name = (displayNameEl.value || '').trim() || user.email;
    profileMsg.textContent = '';
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: name,
        public_name: name,
        display_name: name,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;
      profileMsg.style.color = 'green';
      profileMsg.textContent = 'Saved ✔';
    } catch (e) {
      console.error('Save profile error:', e);
      profileMsg.style.color = 'crimson';
      profileMsg.textContent = `Error: ${e.message || e}`;
    }
  });

  // Hook up avatar upload (bucket: "avatars")
  setupAvatarUpload({
    supabase,
    user,
    inputSelector: '#avatarInput',
    imgSelector: '#avatarImg',
    messageSelector: '#avatarMsg',
    bucket: 'avatars'
  });
});
