// src/components/AvatarUpload.js — vanilla helper (no React)
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from '../../supabaseClient.js?v=2025.01.09E';
import {
  rest,
  getSessionFromStorage,
} from '../../restClient.js?v=2025.01.09E';

export function setupAvatarUpload({
  user,
  inputSelector = '#avatarInput',
  imgSelector = '#avatarImg',
  messageSelector = '#avatarMsg',
  bucket = 'avatars'
} = {}) {
  const input = document.querySelector(inputSelector);
  const img   = document.querySelector(imgSelector);
  const msg   = document.querySelector(messageSelector);

  if (!input || !user) return;

  const say = (text, color='inherit') => {
    if (!msg) return;
    msg.style.color = color;
    msg.textContent = text;
  };

  input.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    say('Uploading...', '#555');

    try {
      const session = getSessionFromStorage();
      if (!session?.access_token || !user?.id) {
        throw new Error('You need to be signed in to upload an avatar.');
      }

      const safeName = `${Date.now()}_${file.name}`.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `${user.id}/${safeName}`;
      const storageUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
      const response = await fetch(storageUrl, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
          'x-upsert': 'true',
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });
      if (!response.ok) {
        throw new Error((await response.text()) || 'Avatar upload failed');
      }

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

      if (img) img.src = publicUrl;

      await rest(`profiles?id=eq.${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        }),
      });

      say('Avatar updated ✔', 'green');
    } catch (err) {
      console.error('Avatar upload failed:', err);
      say(`Upload failed: ${err.message || err}`, 'crimson');
    }
  });
}
