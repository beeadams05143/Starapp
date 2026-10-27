import { rest, getSessionFromStorage } from './restClient.js';
import { readCachedOnboardingCompletion } from './onboarding-flow.js';

export async function next() {
  const session = getSessionFromStorage();
  if (!session?.user?.id || !session?.access_token) {
    window.location.href = 'login.html';
    return;
  }

  let profile = null;
  try {
    const rows = await rest(
      `profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,role,group_id,onboarding_complete,onboarding_step&limit=1`
    );
    profile = Array.isArray(rows) ? rows[0] || null : null;
  } catch (error) {
    console.warn('[ROUTER] profile fetch failed, using onboarding cache fallback when available', error);
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
    // Returning test users may have saved their configuration already while
    // their onboarding_step still says caregiver-setup. Don't loop back into
    // setup or force a second write to the group's unique config row.
    try {
      const configs = await rest(
        `caregiver_checkin_configs?group_id=eq.${encodeURIComponent(profile.group_id)}&select=id&limit=1`
      );
      if (Array.isArray(configs) && configs.length > 0) {
        window.location.href = 'dashboard.html';
        return;
      }
    } catch (error) {
      console.warn('[ROUTER] could not check saved caregiver setup', error);
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
