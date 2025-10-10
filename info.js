import { supabase } from './supabaseClient.js';

const userId = localStorage.getItem('user_id'); // or get from auth session

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
  const { data, error } = await supabase
    .from('support_info')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (data) {
    fields.forEach(id => {
      document.getElementById(id).value = data[id] || '';
    });
  }

  if (error && error.code !== 'PGRST116') {
    console.error('Load error:', error.message);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = {};
  fields.forEach(id => {
    formData[id] = document.getElementById(id).value;
  });

  const { data, error } = await supabase
    .from('support_info')
    .upsert({ user_id: userId, ...formData }, { onConflict: ['user_id'] });

  if (error) {
    alert('Error saving info: ' + error.message);
  } else {
    alert('✅ Information saved successfully.');
  }
});

loadSupportInfo();
