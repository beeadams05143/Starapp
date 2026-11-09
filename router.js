import { rest, getSessionFromStorage } from './restClient.js?v=2026.10.29UVM3';
import { readCachedOnboardingCompletion, completeGuidedOnboarding } from './onboarding-flow.js?v=2026.10.29UVM3';

export async function next() {
  const session = getSessionFromStorage();
  if (!session?.user?.id || !session?.access_token) {
    window.location.href = 'auth.html?reauth=1';
    return;
  }

  let profile = null;
  try {
    const rows = await rest(
      `profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,role,group_id,onboarding_complete,onboarding_step&limit=1`
    );
    profile = Array.isArray(rows) ? rows[0] || null : null;
  } catch (error) {
    console.warn('[ROUTER] unable to verify profile, directing test user to sign in', error);
    window.location.href = 'auth.html?reauth=1';
    return;
  }
  const onboardingComplete = profile && Object.prototype.hasOwnProperty.call(profile, 'onboarding_complete')
    ? profile.onboarding_complete === true
    : readCachedOnboardingCompletion(session.user.id);

  if (onboardingComplete === true) {
    window.location.href = 'dashboard.html';
    return;
  }

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
    // Either a group configuration or a caregiver assignment completes setup.
    // A failed lookup must not prevent checking the other storage path.
    const checks = await Promise.allSettled([
      rest(`caregiver_checkin_configs?group_id=eq.${encodeURIComponent(profile.group_id)}&select=id&limit=1`),
      rest(`star_caregiver_checkin_assignments?group_id=eq.${encodeURIComponent(profile.group_id)}&active=eq.true&select=id&limit=1`),
    ]);
    if (checks.some(result => result.status === 'fulfilled' && Array.isArray(result.value) && result.value.length > 0)) {
      await completeGuidedOnboarding(session.user.id);
      window.location.href = 'dashboard.html';
      return;
    }
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
