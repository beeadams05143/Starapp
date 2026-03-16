import { rest, getSessionFromStorage } from './restClient.js?v=2026.03.12D';

const GROUP_KEY_ID = 'currentGroupId';
const GROUP_KEY_NAME = 'currentGroupName';
const DEFAULT_APP_NAME = 'STAR App';

export function normalizeRedirect(value, fallback = 'dashboard.html') {
  if (!value) return fallback;
  const trimmed = String(value).replace(/^\/+/, '').split(/[?#]/)[0].trim();
  if (!trimmed || trimmed.includes('://') || trimmed.startsWith('//') || trimmed.startsWith('javascript:')) {
    return fallback;
  }
  return trimmed || fallback;
}

export async function fetchCurrentProfile(userId = null) {
  const session = getSessionFromStorage();
  const resolvedUserId = userId || session?.user?.id || null;
  if (!resolvedUserId) return null;
  const rows = await rest(
    `profiles?id=eq.${encodeURIComponent(
      resolvedUserId
    )}&select=id,full_name,public_name,display_name,group_id,updated_at&limit=1`
  );
  return rows?.[0] || null;
}

export async function fetchCurrentMemberships(userId = null) {
  const session = getSessionFromStorage();
  const resolvedUserId = userId || session?.user?.id || null;
  if (!resolvedUserId) return [];
  const rows = await rest([
    'group_members?select=group_id,role,groups!inner(id,name,archived)',
    `user_id=eq.${encodeURIComponent(resolvedUserId)}`,
    'order=joined_at.asc',
  ].join('&'));
  return Array.isArray(rows) ? rows : [];
}

export function profileNeedsOnboarding(profile) {
  return !profile?.id;
}

export async function resolvePostAuthDestination({ userId = null, redirect = 'dashboard.html' } = {}) {
  const profile = await fetchCurrentProfile(userId);
  const memberships = await fetchCurrentMemberships(userId);
  if (!profile) {
    return 'onboarding.html';
  }
  if (!memberships || memberships.length === 0) {
    return 'onboarding.html';
  }
  return 'dashboard.html';
}

export function cacheActiveGroup(groupId, groupName = '') {
  try {
    if (groupId) localStorage.setItem(GROUP_KEY_ID, groupId);
    if (groupName) localStorage.setItem(GROUP_KEY_NAME, groupName);
  } catch {
    // ignore storage failures
  }
}

export function resolveInviteCodeValue(group = {}) {
  return (
    group?.invite_code ||
    group?.join_code ||
    ''
  );
}

export function deriveInviterContact({ user = null, profile = null } = {}) {
  const inviterName = (
    profile?.display_name ||
    profile?.public_name ||
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    ''
  ).trim();
  const inviterEmail = (user?.email || '').trim();
  return {
    inviterName: inviterName || '',
    inviterEmail: inviterEmail || '',
  };
}

function buildHelpLine(inviterName, inviterEmail) {
  if (inviterName && inviterEmail) {
    return `If you need help, contact ${inviterName} at ${inviterEmail}.`;
  }
  if (inviterName) {
    return `If you need help, contact ${inviterName}.`;
  }
  if (inviterEmail) {
    return `If you need help, contact ${inviterEmail}.`;
  }
  return 'If you need help, please contact the person who shared this invite with you.';
}

function buildGroupStep(groupName, roleHint) {
  const groupLabel = groupName ? ` (${groupName})` : '';
  if (roleHint === 'caregiver') {
    return `5. Follow onboarding to join the correct group${groupLabel} as a caregiver/support person`;
  }
  return `5. Follow the onboarding steps to join the correct group${groupLabel}`;
}

function buildRoleIntro(appName, roleHint) {
  if (roleHint === 'caregiver') {
    return `Hi! You've been invited to join ${appName} as a caregiver/support person.`;
  }
  return `Hi! You've been invited to join ${appName}.`;
}

function buildRoleOutro(roleHint) {
  if (roleHint === 'caregiver') {
    return "Once you're in, you'll be able to access caregiver features based on your permissions.";
  }
  if (roleHint === 'individual') {
    return "Once you're in, you can begin using your STAR tools and supports.";
  }
  return "Once you're in, you can begin using the app features available to your role.";
}

export function buildInviteMessage({
  appName = DEFAULT_APP_NAME,
  joinLink = '',
  inviteCode = '',
  groupName = '',
  inviterName = '',
  inviterEmail = '',
  roleHint = 'general',
} = {}) {
  const resolvedJoinLink = String(joinLink || '').trim();
  const resolvedInviteCode = String(inviteCode || '').trim();
  if (!resolvedJoinLink) throw new Error('Missing join link for invite message.');
  if (!resolvedInviteCode) throw new Error('Missing invite code for invite message.');

  const normalizedRole = ['caregiver', 'individual'].includes(roleHint) ? roleHint : 'general';

  return [
    buildRoleIntro(appName || DEFAULT_APP_NAME, normalizedRole),
    '',
    'To get started:',
    `1. Open this link: ${resolvedJoinLink}`,
    '2. Create your account using your email and password',
    '3. Complete your profile',
    `4. Enter this invite code when prompted: ${resolvedInviteCode}`,
    buildGroupStep(groupName, normalizedRole),
    '',
    buildRoleOutro(normalizedRole),
    '',
    buildHelpLine(inviterName, inviterEmail),
  ].join('\n');
}

function buildProfilePayload(userId, profile, { name, groupId = null } = {}) {
  const displayName = (name || '').trim();
  return {
    id: userId,
    full_name: displayName || profile?.full_name || profile?.display_name || profile?.public_name || '',
    public_name: displayName || profile?.public_name || profile?.display_name || profile?.full_name || '',
    display_name: displayName || profile?.display_name || profile?.public_name || profile?.full_name || '',
    group_id: groupId ?? profile?.group_id ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function saveProfileBasics(userId, options = {}) {
  const current = await fetchCurrentProfile(userId);
  const payload = buildProfilePayload(userId, current, options);
  const rows = await rest('profiles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([payload]),
  });
  return rows?.[0] || payload;
}

function generateInviteCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function ensureUniqueInviteCode(length = 6) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateInviteCode(length);
    const rows = await rest(`groups?invite_code=eq.${encodeURIComponent(code)}&select=id&limit=1`);
    if (!rows?.length) return code;
  }
  throw new Error('Could not generate a unique invite code. Please try again.');
}

async function insertMembership(userId, groupId, membershipRole) {
  const existing = await rest([
    'group_members?select=group_id',
    `user_id=eq.${encodeURIComponent(userId)}`,
    `group_id=eq.${encodeURIComponent(groupId)}`,
    'limit=1',
  ].join('&'));
  if (existing?.length) return existing[0];
  const payload = { user_id: userId, group_id: groupId, role: membershipRole };
  const rows = await rest('group_members', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([payload]),
  });
  return rows?.[0] || payload;
}

export async function createGroupForUser(userId, groupName) {
  const name = (groupName || '').trim();
  if (!name) throw new Error('Enter a group name.');
  if (!userId) throw new Error('You must be signed in to create a group.');
  const existingGroups = await rest('groups?select=id,name&limit=1000');
  const normalizedName = name.toLocaleLowerCase();
  if ((existingGroups || []).some((group) => String(group?.name || '').trim().toLocaleLowerCase() === normalizedName)) {
    throw new Error('This group name is already in use. Please choose another name.');
  }
  const inviteCode = await ensureUniqueInviteCode();
  const rows = await rest('groups', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ name, created_by: userId, invite_code: inviteCode, archived: false }]),
  });
  const group = rows?.[0];
  if (!group?.id) throw new Error('Could not create group.');
  await insertMembership(userId, group.id, 'admin');
  cacheActiveGroup(group.id, group.name || name);
  return group;
}

export async function joinGroupForUser(userId, joinCode) {
  const code = (joinCode || '').trim().toUpperCase();
  if (!code) throw new Error('Enter an invite code.');
  const rows = await rest(`groups?invite_code=eq.${encodeURIComponent(code)}&select=id,name,invite_code&limit=1`);
  const group = rows?.[0] || null;
  if (!group?.id) throw new Error('Invalid invite code.');
  await insertMembership(userId, group.id, 'member');
  cacheActiveGroup(group.id, group.name || '');
  return group;
}

export async function saveProfileDefaultGroup(userId, groupId) {
  const rows = await rest(`profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      group_id: groupId,
      updated_at: new Date().toISOString(),
    }),
  });
  return rows?.[0] || null;
}
