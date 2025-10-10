// src/components/AvatarUpload.js — vanilla helper (no React)
export function setupAvatarUpload({
  supabase,
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
      const path = `${user.id}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      if (img) img.src = publicUrl;

      const { error: updErr } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updErr) throw updErr;

      say('Avatar updated ✔', 'green');
    } catch (err) {
      console.error('Avatar upload failed:', err);
      say(`Upload failed: ${err.message || err}`, 'crimson');
    }
  });
}
