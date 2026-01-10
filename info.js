import { rest, getSessionFromStorage } from './restClient.js?v=2025.01.09E';

const session = getSessionFromStorage();
const userId = session?.user?.id || localStorage.getItem('user_id');

const form = document.getElementById('support-form');
const fields = [
  'emergencyContacts',
  'medications',
  'schedule',
  'primaryCare',
  'dentist',
  'specialists'
];

async function loadSupportInfo() {
  if (!userId) {
    console.warn('No user id available for support info.');
    return;
  }

  try {
    const rows = await rest(
      `support_info?user_id=eq.${encodeURIComponent(userId)}&select=*`
    );
    const data = rows?.[0] || null;
    if (data) {
      fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = data[id] || '';
      });
    }
  } catch (error) {
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    console.error('Load error:', error?.message || error);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!userId) {
    alert('No user session found.');
    return;
  }

  const formData = {};
  fields.forEach(id => {
    const el = document.getElementById(id);
    formData[id] = el ? el.value : '';
  });

  try {
    await rest('support_info', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([{ user_id: userId, ...formData }]),
    });
    alert('✅ Information saved successfully.');
  } catch (error) {
    alert('Error saving info: ' + (error?.message || error));
  }
});

loadSupportInfo();
