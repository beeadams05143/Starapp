import { rest, getSessionFromStorage } from './restClient.js';

export async function next() {
  const session = getSessionFromStorage();
  if (!session?.user?.id || !session?.access_token) {
    window.location.href = 'login.html';
    return;
  }

  const rows = await rest(
    `profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,role,group_id,onboarding_step&limit=1`
  );
  const profile = Array.isArray(rows) ? rows[0] || null : null;

  if (!profile?.role) {
    window.location.href = 'role-select.html';
    return;
  }

  if (!profile?.group_id) {
    window.location.href = 'group-setup.html';
    return;
  }

  if (profile.onboarding_step === 'profile') {
    window.location.href = 'profile.html';
    return;
  }

  if (profile.onboarding_step === 'welcome') {
    window.location.href = 'welcome.html';
    return;
  }

  if (profile.onboarding_step === 'caregiver-setup') {
    window.location.href = 'caregiver-setup-wizard.html';
    return;
  }

  if (profile.onboarding_step === 'checkin' && profile.role === 'caregiver') {
    window.location.href = 'caregiver-checkin.html';
    return;
  }

  if (profile.onboarding_step === 'checkin' && profile.role === 'individual') {
    window.location.href = 'moodchecker_with_other_moods.html';
    return;
  }

  window.location.href = 'dashboard.html';
}
