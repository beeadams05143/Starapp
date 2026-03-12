import { rest, getSessionFromStorage } from './restClient.js?v=2025.01.09E';

const GROUP_KEY_ID = 'currentGroupId';
const GROUP_KEY_NAME = 'currentGroupName';

function readStoredGroupId() {
  try {
    return localStorage.getItem(GROUP_KEY_ID) || null;
  } catch {
    return null;
  }
}

function writeStoredGroup(groupId, groupName = '') {
  try {
    if (groupId) localStorage.setItem(GROUP_KEY_ID, groupId);
    if (groupName) localStorage.setItem(GROUP_KEY_NAME, groupName);
  } catch {
    // ignore storage failures
  }
}

async function fetchMemberships(userId) {
  if (!userId) return [];
  try {
    const rows = await rest([
      'group_members?select=group_id,joined_at,groups!inner(id,name)',
      `user_id=eq.${encodeURIComponent(userId)}`,
      'order=joined_at.asc',
    ].join('&'));
    return Array.isArray(rows) ? rows.filter((row) => row?.group_id) : [];
  } catch (error) {
    console.warn('[active-group] membership lookup failed', error?.message || error);
    return [];
  }
}

async function fetchProfileGroupId(userId) {
  if (!userId) return null;
  try {
    const rows = await rest(
      `profiles?id=eq.${encodeURIComponent(userId)}&select=group_id&limit=1`
    );
    return rows?.[0]?.group_id || null;
  } catch (error) {
    console.warn('[active-group] profile group lookup failed', error?.message || error);
    return null;
  }
}

function pickMembership(memberships, preferredIds = []) {
  const ordered = preferredIds.filter(Boolean);
  for (const candidate of ordered) {
    const match = memberships.find((row) => row.group_id === candidate);
    if (match) return match;
  }
  return memberships[0] || null;
}

export async function resolveActiveGroup(userId = null) {
  const session = getSessionFromStorage();
  const resolvedUserId = userId || session?.user?.id || null;
  if (!resolvedUserId) {
    return { groupId: null, groupName: null, memberships: [], source: 'none' };
  }

  const [memberships, profileGroupId] = await Promise.all([
    fetchMemberships(resolvedUserId),
    fetchProfileGroupId(resolvedUserId),
  ]);

  const storedGroupId = readStoredGroupId();
  const chosen = pickMembership(memberships, [profileGroupId, storedGroupId]);
  const groupId = chosen?.group_id || null;
  const groupName = chosen?.groups?.name || '';
  const source =
    groupId && groupId === profileGroupId ? 'profile'
      : groupId && groupId === storedGroupId ? 'storage'
        : groupId ? 'membership'
          : 'none';

  if (groupId) writeStoredGroup(groupId, groupName);
  return { groupId, groupName, memberships, source };
}

export async function ensureActiveGroupId(userId = null) {
  const { groupId } = await resolveActiveGroup(userId);
  return groupId || null;
}

export function getCachedActiveGroupId() {
  return readStoredGroupId();
}
